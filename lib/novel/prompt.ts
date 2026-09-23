import type { NovelSettings, ManuscriptState } from "./types";

/**
 * 小说创作 System Prompt 组装（服务端）。
 *
 * System Prompt 由服务端组装，前端不感知模型细节。
 * 至少包含：作品设定、人物信息、故事大纲、当前章节目标、当前正文，
 * 以及（由调用方附加的）最近几轮对话与用户本次指令。
 */

const ROLE_RULES = [
  "你是与作者协作的中文小说创作助手。",
  "遵守人物设定、世界规则、时间线、叙事视角和文风。",
  "用户要求正文时，直接输出正文，不附加无关解释。",
  "用户要求分析时，区分问题、原因和修改建议。",
  "不擅自改变主线或增加重大设定。",
  "不确定的信息不要假装已经在前文出现。",
];

const UNFILLED = "（未填写）";

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** 生成 System Prompt（含角色、创作原则、作品设定、正文上下文） */
export function buildSystemPrompt(
  settings: NovelSettings,
  manuscript: ManuscriptState
): string {
  const lines: string[] = [];

  lines.push("# 角色");
  lines.push(ROLE_RULES[0]);
  lines.push("");

  lines.push("# 创作原则");
  ROLE_RULES.slice(1).forEach((rule, i) => {
    lines.push(`${i + 1}. ${rule}`);
  });
  lines.push("");

  lines.push("# 作品设定");
  lines.push(`- 小说名称：${nonEmpty(settings.title) ? settings.title : UNFILLED}`);
  lines.push(`- 类型：${nonEmpty(settings.genre) ? settings.genre : UNFILLED}`);
  lines.push(
    `- 故事简介：${nonEmpty(settings.summary) ? settings.summary : UNFILLED}`
  );
  lines.push(`- 写作风格：${nonEmpty(settings.style) ? settings.style : UNFILLED}`);
  lines.push("");

  if (nonEmpty(settings.worldview)) {
    lines.push("# 世界观");
    lines.push(settings.worldview.trim());
    lines.push("");
  }

  if (nonEmpty(settings.characters)) {
    lines.push("# 主要人物");
    lines.push(settings.characters.trim());
    lines.push("");
  }

  if (nonEmpty(settings.outline)) {
    lines.push("# 故事大纲");
    lines.push(settings.outline.trim());
    lines.push("");
  }

  if (nonEmpty(settings.chapterGoal)) {
    lines.push("# 当前章节目标");
    lines.push(settings.chapterGoal.trim());
    lines.push("");
  }

  lines.push("# 当前正文");
  if (nonEmpty(manuscript.chapterTitle)) {
    lines.push(`- 章节标题：${manuscript.chapterTitle.trim()}`);
  }
  lines.push(
    manuscript.content.trim() ? manuscript.content.trim() : "（本章尚未开始，请从空白处续写。）"
  );

  return lines.join("\n");
}

/** 拼接「最近几轮对话」为 Prompt 的上下文片段（用于展示/调试，实际多轮由消息数组承载） */
export function formatRecentMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxRounds = 6
): string {
  const recent = messages.slice(-maxRounds * 2);
  if (recent.length === 0) return "";
  return recent
    .map((m) => `${m.role === "user" ? "作者" : "助手"}：${m.content}`)
    .join("\n");
}
