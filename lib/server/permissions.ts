/**
 * 工作区权限校验。
 *
 * 所有数据接口都必须：① 校验当前用户；② 校验其是否为该工作区成员及角色。
 * 绝不信任前端传入的 userId / workspaceId 作为授权依据。
 */

import { prisma } from "@/lib/db/prisma";
import type { MemberRole } from "@/lib/domain/types";

const ROLE_ORDER: Record<MemberRole, number> = { viewer: 0, editor: 1, owner: 2 };

export function roleAtLeast(role: MemberRole, min: MemberRole): boolean {
  return ROLE_ORDER[role] >= ROLE_ORDER[min];
}

export type PermissionResult =
  | { ok: true; role: MemberRole }
  | { ok: false; status: 403 | 404; error: string };

/** 查询某用户在工作区的角色；非成员返回 null */
export async function getMemberRole(
  workspaceId: string,
  userId: string
): Promise<MemberRole | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return member ? (member.role as MemberRole) : null;
}

/** 校验用户为工作区成员且角色不低于 minRole */
export async function requireRole(
  workspaceId: string,
  userId: string,
  minRole: MemberRole
): Promise<PermissionResult> {
  const role = await getMemberRole(workspaceId, userId);
  if (!role) {
    // 不区分「不存在」与「无权限」，避免泄露工作区是否存在
    return { ok: false, status: 404, error: "工作区不存在或无权访问" };
  }
  if (!roleAtLeast(role, minRole)) {
    return { ok: false, status: 403, error: "权限不足" };
  }
  return { ok: true, role };
}
