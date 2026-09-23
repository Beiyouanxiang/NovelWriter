"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusIndicator } from "./StatusIndicator";
import type { Workspace, Novel } from "@/lib/domain/types";
import type { SaveStatus, SyncStatus } from "@/lib/client/use-workspace";

interface TopBarProps {
  workspaces: Workspace[];
  novels: Novel[];
  currentWorkspaceId: string;
  currentNovelId: string | null;
  onWorkspaceChange: (id: string) => void;
  onNovelChange: (id: string) => void;
  online: boolean;
  saveStatus: SaveStatus;
  syncStatus: SyncStatus;
  pendingCount: number;
  onSync: () => void;
  onNewWorkspace: () => void;
}

export default function TopBar(props: TopBarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const workspaceNovels = props.novels.filter((n) => n.workspaceId === props.currentWorkspaceId);

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e7e2d8] bg-[#fbfaf7] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-[#2b2a27]">小说创作工作台</h1>

        <select
          className="field-input !w-auto !py-1 text-sm"
          value={props.currentWorkspaceId}
          onChange={(e) => props.onWorkspaceChange(e.target.value)}
        >
          {props.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <select
          className="field-input !w-auto !py-1 text-sm"
          value={props.currentNovelId ?? ""}
          onChange={(e) => props.onNovelChange(e.target.value)}
        >
          <option value="">（选择小说）</option>
          {workspaceNovels.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <StatusIndicator
          online={props.online}
          saveStatus={props.saveStatus}
          syncStatus={props.syncStatus}
          pendingCount={props.pendingCount}
        />
        {props.syncStatus === "error" || (props.pendingCount > 0 && props.syncStatus === "pending") ? (
          <button className="btn !px-2 !py-1 text-xs" onClick={props.onSync}>
            立即同步
          </button>
        ) : null}

        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6b675f]">{user.displayName || user.email}</span>
            <button
              className="btn !px-2 !py-1 text-xs"
              onClick={async () => {
                await logout();
                router.refresh();
              }}
            >
              退出
            </button>
          </div>
        ) : (
          <button
            className="btn-primary !px-3 !py-1 text-xs"
            onClick={() => router.push("/login")}
          >
            登录
          </button>
        )}
      </div>
    </header>
  );
}
