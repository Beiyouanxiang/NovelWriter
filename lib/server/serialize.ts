/**
 * 数据库实体 → API 序列化（日期转 ISO 字符串）。
 */

type NovelRow = {
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
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type ChapterRow = {
  id: string;
  novelId: string;
  title: string;
  content: string;
  chapterGoal: string;
  sortOrder: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export function serializeNovel(n: NovelRow) {
  return {
    id: n.id,
    workspaceId: n.workspaceId,
    title: n.title,
    genre: n.genre,
    summary: n.summary,
    style: n.style,
    worldview: n.worldview,
    characters: n.characters,
    outline: n.outline,
    revision: n.revision,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    deletedAt: n.deletedAt ? n.deletedAt.toISOString() : null,
  };
}

export function serializeChapter(c: ChapterRow) {
  return {
    id: c.id,
    novelId: c.novelId,
    title: c.title,
    content: c.content,
    chapterGoal: c.chapterGoal,
    sortOrder: c.sortOrder,
    revision: c.revision,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
  };
}
