/**
 * 版本历史：为小说设定与章节正文记录 Revision 快照，并限制保留数量。
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const MAX_REVISIONS = 30;

export function novelSnapshot(novel: {
  title: string;
  genre: string;
  summary: string;
  style: string;
  worldview: string;
  characters: string;
  outline: string;
}): Prisma.InputJsonValue {
  return {
    title: novel.title,
    genre: novel.genre,
    summary: novel.summary,
    style: novel.style,
    worldview: novel.worldview,
    characters: novel.characters,
    outline: novel.outline,
  };
}

export function chapterSnapshot(chapter: {
  title: string;
  content: string;
  chapterGoal: string;
  sortOrder: number;
}): Prisma.InputJsonValue {
  return {
    title: chapter.title,
    content: chapter.content,
    chapterGoal: chapter.chapterGoal,
    sortOrder: chapter.sortOrder,
  };
}

export async function recordRevision(
  entityType: "novel" | "chapter",
  entityId: string,
  revision: number,
  snapshot: Prisma.InputJsonValue,
  userId: string
): Promise<void> {
  await prisma.revision.create({
    data: { entityType, entityId, revision, snapshot, userId },
  });

  // 仅保留最近 MAX_REVISIONS 个版本（按 revision 降序，删除更早的）
  const old = await prisma.revision.findMany({
    where: { entityType, entityId },
    orderBy: { revision: "desc" },
    select: { id: true },
    skip: MAX_REVISIONS,
  });
  if (old.length > 0) {
    await prisma.revision.deleteMany({
      where: { id: { in: old.map((r) => r.id) } },
    });
  }
}
