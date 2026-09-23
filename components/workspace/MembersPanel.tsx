"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import type { WorkspaceMember } from "@/lib/domain/types";

interface MembersPanelProps {
  workspaceId: string;
  role?: string; // 当前用户角色
  onClose: () => void;
}

export default function MembersPanel({ workspaceId, role, onClose }: MembersPanelProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const isOwner = role === "owner";

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ members: WorkspaceMember[] }>(
        `/api/workspaces/${workspaceId}/members`
      );
      setMembers(data.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载成员失败");
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!email.trim()) return;
    setError("");
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        body: { email: email.trim() },
      });
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败");
    }
  }

  async function changeRole(userId: string, role: "editor" | "viewer") {
    await apiFetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      body: { role },
    });
    await load();
  }

  async function remove(userId: string) {
    await apiFetch(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#e7e2d8] bg-[#fbfaf7] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#2b2a27]">工作区成员</h3>
          <button className="btn !px-2 !py-1 text-xs" onClick={onClose}>
            关闭
          </button>
        </div>

        {isOwner && (
          <div className="mb-4 flex gap-2">
            <input
              className="field-input flex-1 text-sm"
              placeholder="输入已注册用户的邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-primary !px-3 text-xs" onClick={add}>
              添加
            </button>
          </div>
        )}

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm text-[#2b2a27]">
                  {m.displayName || m.email}
                  {m.role === "owner" && (
                    <span className="ml-1 rounded bg-[#efe6d9] px-1 text-xs text-[#8a5a44]">owner</span>
                  )}
                </div>
                <div className="text-xs text-[#b5ad9e]">{m.email}</div>
              </div>
              {isOwner && m.role !== "owner" && (
                <div className="flex items-center gap-1">
                  <select
                    className="field-input !w-auto !py-0.5 text-xs"
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.target.value as "editor" | "viewer")}
                  >
                    <option value="editor">编辑</option>
                    <option value="viewer">只读</option>
                  </select>
                  <button className="btn !px-2 !py-0.5 text-xs text-red-500" onClick={() => remove(m.userId)}>
                    移除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
