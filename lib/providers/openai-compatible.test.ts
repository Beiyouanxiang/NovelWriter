import { describe, it, expect } from "vitest";
import { extractDeltaFromSSEData } from "./openai-compatible";

describe("extractDeltaFromSSEData", () => {
  it("提取 delta 文本", () => {
    expect(
      extractDeltaFromSSEData('{"choices":[{"delta":{"content":"你好"}}]}')
    ).toBe("你好");
  });

  it("提取多段 delta", () => {
    expect(
      extractDeltaFromSSEData(
        '{"choices":[{"delta":{"content":"长安"}}]}'
      )
    ).toBe("长安");
  });

  it("处理 [DONE] 结束标记", () => {
    expect(extractDeltaFromSSEData("[DONE]")).toBeNull();
  });

  it("忽略无 content 的行（如 role 信息）", () => {
    expect(
      extractDeltaFromSSEData('{"choices":[{"delta":{"role":"assistant"}}]}')
    ).toBeNull();
  });

  it("忽略空 content", () => {
    expect(
      extractDeltaFromSSEData('{"choices":[{"delta":{"content":""}}]}')
    ).toBeNull();
  });

  it("处理非法 JSON", () => {
    expect(extractDeltaFromSSEData("not-a-json")).toBeNull();
  });

  it("处理空字符串", () => {
    expect(extractDeltaFromSSEData("")).toBeNull();
    expect(extractDeltaFromSSEData("   ")).toBeNull();
  });
});
