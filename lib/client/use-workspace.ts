"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import * as repo from "@/lib/local-db/repository";
import * as queue from "@/lib/local-db/operation-queue";
import { migrateFromLocalStorage } from "@/lib/local-db/migration";
import { saveRecoverySnapshot } from "@/lib/local-db/recovery";
import {
  enqueueChapterUpsert,
  enqueueNovelUpsert,
  enqueueDelete,
  syncNow,
  resolveConflict,
  getConflictsForWorkspace,
  type PendingOperation,
} from "@/lib/sync/engine";
import type { ConflictRecord } from "@/lib/local-db/conflicts";
import type { Workspace, Novel, Chapter } from "@/lib/domain/types";
import { apiFetch } from "@/lib/client/api";
import { LOCAL_WORKSPACE_ID } from "@/lib/local-db/schema";

export type SaveStatus = "saving" | "saved";
export type SyncStatus = "pending" | "syncing" | "synced" | "error" | "offline";

export function useWorkspace() {
  const { user } = useAuth();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [novels, setNovels] = useState<Novel[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(LOCAL_WORKSPACE_ID);
  const [currentNovelId, setCurrentNovelId] = useState<string | null>(null);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("pending");
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 加载本地数据 + 迁移 ----
  const loadLocal = useCallback(async () => {
    try {
      await migrateFromLocalStorage();
      setMigrationError(null);
    } catch (e) {
      setMigrationError(e instanceof Error ? e.message : "本地数据迁移失败");
    }
    const [ws, ns, cs] = await Promise.all([
      repo.getAllWorkspaces(),
      repo.getAllNovels(),
      repo.getAllChapters(),
    ]);
    setWorkspaces(ws);
    setNovels(ns);
    setChapters(cs);
    setCurrentWorkspaceId((prev) =>
      ws.some((w) => w.id === prev) ? prev : ws[0]?.id ?? LOCAL_WORKSPACE_ID
    );
  }, []);

  // ---- 登录后拉取云端工作区 ----
  const loadCloudWorkspaces = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch<{ workspaces: Workspace[] }>("/api/workspaces");
      for (const ws of data.workspaces) {
        await repo.putWorkspace(ws);
      }
      setWorkspaces(await repo.getAllWorkspaces());
    } catch {
      // 离线/失败时静默，保留本地缓存
    }
  }, [user]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    void loadCloudWorkspaces();
  }, [loadCloudWorkspaces]);

  // ---- 在线/离线状态 ----
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ---- 刷新待同步数量 ----
  const refreshPending = useCallback(async () => {
    setPendingCount(await queue.pendingCount());
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  // ---- 同步 ----
  const doSync = useCallback(async () => {
    if (!user || !online) return;
    setSyncStatus("syncing");
    try {
      const outcome = await syncNow(currentWorkspaceId);
      setConflicts(await getConflictsForWorkspace());
      await refreshPending();
      setSyncStatus(outcome.conflicts.length > 0 ? "error" : "synced");
      await loadLocal();
      await saveRecoverySnapshot();
    } catch {
      setSyncStatus("error");
    }
  }, [user, online, currentWorkspaceId, refreshPending, loadLocal]);

  // 联网后自动同步
  useEffect(() => {
    if (online && user) void doSync();
  }, [online, user, doSync]);

  // ---- 编辑章节正文：立即更新状态 + 防抖保存 ----
  const updateChapter = useCallback(
    (chapterId: string, patch: Partial<Chapter>) => {
      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                ...patch,
                revision: c.revision + 1,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const all = await repo.getAllChapters();
          const chapter = all.find((c) => c.id === chapterId);
          if (!chapter) return;
          const baseRevision = chapter.revision - 1;
          await repo.putChapter(chapter);
          const wsId = await workspaceOfChapter(chapter);
          await enqueueChapterUpsert(wsId, chapter, baseRevision);
          await refreshPending();
          setSaveStatus("saved");
          setSyncStatus("pending");
        } catch {
          setSaveStatus("saved");
        }
      }, 400);
    },
    [refreshPending]
  );

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSaveStatus("saved");
  }, []);

  // ---- 编辑小说设定：立即保存 + 入队（字段级合并） ----
  const updateNovel = useCallback(
    async (novelId: string, patch: Partial<Novel>) => {
      const all = await repo.getAllNovels();
      const novel = all.find((n) => n.id === novelId);
      if (!novel) return;
      const updated: Novel = {
        ...novel,
        ...patch,
        revision: novel.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      setNovels((prev) => prev.map((n) => (n.id === novelId ? updated : n)));
      setSaveStatus("saving");
      await repo.putNovel(updated);
      if (novel.workspaceId !== LOCAL_WORKSPACE_ID) {
        await enqueueNovelUpsert(novel.workspaceId, updated, patch as Record<string, string>);
        await refreshPending();
        setSyncStatus("pending");
      }
      setSaveStatus("saved");
    },
    [refreshPending]
  );

  // 离开页面 / 切后台时立即 flush
  useEffect(() => {
    const onHide = () => void flush();
    const onVis = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flush]);

  // ---- 工作区/小说/章节管理 ----
  const createWorkspace = useCallback(
    async (name: string) => {
      if (!user) return;
      const data = await apiFetch<{ workspace: Workspace }>("/api/workspaces", {
        method: "POST",
        body: { name },
      });
      await repo.putWorkspace(data.workspace);
      setWorkspaces(await repo.getAllWorkspaces());
      setCurrentWorkspaceId(data.workspace.id);
    },
    [user]
  );

  const createNovel = useCallback(
    async (title: string) => {
      if (currentWorkspaceId === LOCAL_WORKSPACE_ID) {
        // 本地未同步：直接建本地小说
        const novel: Novel = {
          id: `local-novel-${Date.now()}`,
          workspaceId: LOCAL_WORKSPACE_ID,
          title,
          genre: "",
          summary: "",
          style: "",
          worldview: "",
          characters: "",
          outline: "",
          revision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        await repo.putNovel(novel);
        setNovels(await repo.getAllNovels());
        setCurrentNovelId(novel.id);
        return;
      }
      const data = await apiFetch<{ novel: Novel }>(
        `/api/workspaces/${currentWorkspaceId}/novels`,
        { method: "POST", body: { title } }
      );
      await repo.putNovel(data.novel);
      setNovels(await repo.getAllNovels());
      setCurrentNovelId(data.novel.id);
    },
    [currentWorkspaceId]
  );

  const createChapter = useCallback(async () => {
    if (!currentNovelId) return;
    const novel = (await repo.getAllNovels()).find((n) => n.id === currentNovelId);
    if (!novel) return;
    const chapter: Chapter = {
      id: `local-chapter-${Date.now()}`,
      novelId: currentNovelId,
      title: "新章节",
      content: "",
      chapterGoal: "",
      sortOrder: Date.now(),
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await repo.putChapter(chapter);
    if (novel.workspaceId !== LOCAL_WORKSPACE_ID) {
      await enqueueChapterUpsert(novel.workspaceId, chapter, 0);
      await refreshPending();
    }
    setChapters(await repo.getAllChapters());
    setCurrentChapterId(chapter.id);
  }, [currentNovelId, refreshPending]);

  const deleteChapter = useCallback(
    async (chapterId: string) => {
      const chapter = (await repo.getAllChapters()).find((c) => c.id === chapterId);
      if (!chapter) return;
      await repo.putChapter({ ...chapter, deletedAt: new Date().toISOString() });
      const wsId = await workspaceOfChapter(chapter);
      if (wsId !== LOCAL_WORKSPACE_ID) {
        await enqueueDelete(wsId, "chapter", chapterId);
        await refreshPending();
      }
      setChapters(await repo.getAllChapters());
      if (currentChapterId === chapterId) setCurrentChapterId(null);
    },
    [currentChapterId, refreshPending]
  );

  const resolveConflictAction = useCallback(
    async (record: ConflictRecord, choice: "local" | "server") => {
      await resolveConflict(record, choice);
      setConflicts(await getConflictsForWorkspace());
      await loadLocal();
      await refreshPending();
    },
    [loadLocal, refreshPending]
  );

  const currentNovel = useMemo(
    () => novels.find((n) => n.id === currentNovelId) ?? null,
    [novels, currentNovelId]
  );
  const currentChapter = useMemo(
    () => chapters.find((c) => c.id === currentChapterId) ?? null,
    [chapters, currentChapterId]
  );

  return {
    workspaces,
    novels,
    chapters,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    currentNovelId,
    setCurrentNovelId,
    currentNovel,
    currentChapterId,
    setCurrentChapterId,
    currentChapter,
    updateChapter,
    updateNovel,
    flush,
    saveStatus,
    syncStatus,
    online,
    pendingCount,
    conflicts,
    migrationError,
    createWorkspace,
    createNovel,
    createChapter,
    deleteChapter,
    doSync,
    resolveConflict: resolveConflictAction,
    retryMigration: loadLocal,
  };
}

async function workspaceOfChapter(chapter: Chapter): Promise<string> {
  const novels = await repo.getAllNovels();
  const novel = novels.find((n) => n.id === chapter.novelId);
  return novel?.workspaceId ?? LOCAL_WORKSPACE_ID;
}

export type { PendingOperation };
