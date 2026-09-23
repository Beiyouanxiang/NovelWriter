import { describe, it, expect, afterEach } from "vitest";
import { getClientIp } from "./client-ip";

const ORIGINAL_ENV = { ...process.env };

describe("getClientIp", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("未配置可信代理头时，忽略所有客户端头，统一返回 unknown", () => {
    delete process.env.TRUSTED_IP_HEADER;
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("配置 TRUSTED_IP_HEADER 后读取指定头", () => {
    process.env.TRUSTED_IP_HEADER = "x-real-ip";
    const req = new Request("http://x/", {
      headers: { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("配置后缺少该头返回 unknown", () => {
    process.env.TRUSTED_IP_HEADER = "x-real-ip";
    const req = new Request("http://x/", {});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("多值头取首项", () => {
    process.env.TRUSTED_IP_HEADER = "x-real-ip";
    const req = new Request("http://x/", {
      headers: { "x-real-ip": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});
