import { describe, it, expect } from "vitest";
import { validateChatRequest, LIMITS, utf8ByteLength } from "./validate";

const ALLOWED = ["deepseek", "kimi"];

function validBody() {
  return {
    provider: "deepseek",
    instruction: "请续写正文",
    context: {
      settings: {
        title: "测试",
        genre: "",
        summary: "",
        style: "",
        worldview: "",
        characters: "",
        outline: "",
        chapterGoal: "",
      },
      manuscript: { chapterTitle: "", content: "正文内容" },
      recentMessages: [
        { role: "user", content: "继续" },
        { role: "assistant", content: "好的" },
      ],
    },
  };
}

describe("validateChatRequest", () => {
  it("合法请求通过校验", () => {
    const result = validateChatRequest(validBody(), ALLOWED);
    expect(result.ok).toBe(true);
    expect(result.value?.instruction).toBe("请续写正文");
  });

  it("拒绝非对象请求体", () => {
    expect(validateChatRequest(null, ALLOWED).ok).toBe(false);
    expect(validateChatRequest("string", ALLOWED).ok).toBe(false);
  });

  it("拒绝不支持的 provider", () => {
    const body = validBody();
    body.provider = "openai";
    const result = validateChatRequest(body, ALLOWED);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("不支持的 provider");
  });

  it("拒绝空指令", () => {
    const body = validBody();
    body.instruction = "   ";
    expect(validateChatRequest(body, ALLOWED).ok).toBe(false);
  });

  it("拒绝超过条数上限的历史消息", () => {
    const body = validBody();
    body.context.recentMessages = Array.from(
      { length: LIMITS.MAX_MESSAGES + 1 },
      () => ({ role: "user", content: "x" })
    );
    expect(validateChatRequest(body, ALLOWED).ok).toBe(false);
  });

  it("拒绝超长单条消息", () => {
    const body = validBody();
    body.context.recentMessages = [
      { role: "user", content: "x".repeat(LIMITS.MAX_MESSAGE_LENGTH + 1) },
    ];
    expect(validateChatRequest(body, ALLOWED).ok).toBe(false);
  });

  it("拒绝非法消息角色", () => {
    const body = validBody();
    body.context.recentMessages = [{ role: "system", content: "x" }];
    expect(validateChatRequest(body, ALLOWED).ok).toBe(false);
  });

  it("拒绝超长设定字段", () => {
    const body = validBody();
    body.context.settings.title = "x".repeat(LIMITS.MAX_SETTING_LENGTH + 1);
    expect(validateChatRequest(body, ALLOWED).ok).toBe(false);
  });
});

describe("utf8ByteLength", () => {
  it("正确计算中文字节数", () => {
    expect(utf8ByteLength("你好")).toBe(6);
    expect(utf8ByteLength("a")).toBe(1);
  });
});
