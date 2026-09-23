import { describe, it, expect } from "vitest";
import { buildSystemPrompt, formatRecentMessages } from "./prompt";
import type { NovelSettings, ManuscriptState } from "./types";

const settings: NovelSettings = {
  title: "长安夜雨",
  genre: "历史 / 悬疑",
  summary: "一位小吏卷入朝堂迷局。",
  style: "冷峻克制，多用短句。",
  worldview: "盛唐背景，暗流涌动。",
  characters: "主角：沈括，谨慎多疑。",
  outline: "第一章：雨夜命案。",
  chapterGoal: "揭示第一桩命案的真相。",
};

const manuscript: ManuscriptState = {
  chapterTitle: "第一章 雨夜",
  content: "夜雨潇潇，长街无人。",
};

describe("buildSystemPrompt", () => {
  it("包含角色定位与创作原则", () => {
    const prompt = buildSystemPrompt(settings, manuscript);
    expect(prompt).toContain("中文小说创作助手");
    expect(prompt).toContain("不擅自改变主线或增加重大设定");
    expect(prompt).toContain("区分问题、原因和修改建议");
  });

  it("包含作品设定", () => {
    const prompt = buildSystemPrompt(settings, manuscript);
    expect(prompt).toContain("长安夜雨");
    expect(prompt).toContain("历史 / 悬疑");
    expect(prompt).toContain("冷峻克制");
  });

  it("包含人物、大纲、章节目标与正文", () => {
    const prompt = buildSystemPrompt(settings, manuscript);
    expect(prompt).toContain("沈括");
    expect(prompt).toContain("雨夜命案");
    expect(prompt).toContain("揭示第一桩命案的真相");
    expect(prompt).toContain("夜雨潇潇，长街无人。");
    expect(prompt).toContain("第一章 雨夜");
  });

  it("空设定时优雅降级，不抛错", () => {
    const empty: NovelSettings = {
      title: "",
      genre: "",
      summary: "",
      style: "",
      worldview: "",
      characters: "",
      outline: "",
      chapterGoal: "",
    };
    const emptyManuscript: ManuscriptState = { chapterTitle: "", content: "" };
    const prompt = buildSystemPrompt(empty, emptyManuscript);
    expect(prompt).toContain("（未填写）");
    expect(prompt).toContain("（本章尚未开始");
  });
});

describe("formatRecentMessages", () => {
  it("只保留最近几轮并正确标注角色", () => {
    const messages = [
      { role: "user" as const, content: "继续" },
      { role: "assistant" as const, content: "好的" },
      { role: "user" as const, content: "再润色" },
      { role: "assistant" as const, content: "已润色" },
    ];
    const text = formatRecentMessages(messages, 1);
    expect(text).not.toContain("继续");
    expect(text).toContain("作者：再润色");
    expect(text).toContain("助手：已润色");
  });

  it("空消息返回空串", () => {
    expect(formatRecentMessages([])).toBe("");
  });
});
