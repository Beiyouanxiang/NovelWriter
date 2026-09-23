/**
 * 领域类型：前后端共享的实体定义（与数据库模型对应）。
 */

export type MemberRole = "owner" | "editor" | "viewer";

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  role?: MemberRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: MemberRole;
  email?: string;
  displayName?: string;
  createdAt: string;
}

export interface Novel {
  id: string;
  workspaceId: string;
  title: string;
  genre: string;
  summary: string;
  style: string;
  worldview: string;
  characters: string;
  outline: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Chapter {
  id: string;
  novelId: string;
  title: string;
  content: string;
  chapterGoal: string;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ChatSession {
  id: string;
  novelId: string;
  chapterId?: string | null;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface RevisionInfo {
  id: string;
  entityType: "novel" | "chapter";
  entityId: string;
  revision: number;
  userId: string;
  createdAt: string;
  snapshot?: unknown;
}

/** 同步操作类型 */
export type SyncOperationType = "upsert" | "delete";

export type EntityType = "novel" | "chapter" | "chatSession" | "chatMessage";

export interface SyncOperationInput {
  operationId: string;
  entityType: EntityType;
  entityId: string;
  operation: SyncOperationType;
  payload?: unknown;
  baseRevision: number;
}

export interface SyncPushResult {
  operationId: string;
  status: "applied" | "conflict" | "error";
  serverRevision?: number;
  serverEntity?: unknown;
  message?: string;
}

export interface SyncPullResponse {
  cursor: string;
  entities: {
    novels: Novel[];
    chapters: Chapter[];
    members: WorkspaceMember[];
    tombstones: Array<{ entityType: EntityType; entityId: string; deletedAt: string }>;
  };
}
