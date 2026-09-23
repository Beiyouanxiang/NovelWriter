"use client";

import type { SaveStatus, SyncStatus } from "@/lib/client/use-workspace";

export function StatusIndicator({
  online,
  saveStatus,
  syncStatus,
  pendingCount,
}: {
  online: boolean;
  saveStatus: SaveStatus;
  syncStatus: SyncStatus;
  pendingCount: number;
}) {
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        离线
      </span>
    );
  }

  if (saveStatus === "saving") {
    return (
      <span className="text-xs text-[#6b675f]">正在本地保存…</span>
    );
  }

  if (syncStatus === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#6b675f]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
        正在同步…
      </span>
    );
  }

  if (syncStatus === "synced" && pendingCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        已同步
      </span>
    );
  }

  if (syncStatus === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        同步失败，可重试
      </span>
    );
  }

  if (pendingCount > 0) {
    return (
      <span className="text-xs text-[#6b675f]">已保存到本机 · 等待同步（{pendingCount}）</span>
    );
  }

  return <span className="text-xs text-[#6b675f]">已保存到本机</span>;
}
