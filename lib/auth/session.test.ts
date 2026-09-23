import { describe, it, expect } from "vitest";
import { signSession, verifySession, sessionCookieOptions } from "./session";

describe("session cookie 安全属性", () => {
  it("HttpOnly + SameSite=Lax + Path=/", () => {
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
  });

  it("生产环境才启用 Secure", () => {
    const opts = sessionCookieOptions();
    expect(opts.secure).toBe(process.env.NODE_ENV === "production");
  });
});

describe("session JWT 签名与校验", () => {
  it("签名后能校验回原始 payload", async () => {
    const token = await signSession({
      sub: "user-1",
      email: "a@example.com",
      displayName: "作者",
    });
    const payload = await verifySession(token);
    expect(payload?.sub).toBe("user-1");
    expect(payload?.email).toBe("a@example.com");
    expect(payload?.displayName).toBe("作者");
  });

  it("非法 token 返回 null", async () => {
    expect(await verifySession("not-a-valid-token")).toBeNull();
    expect(await verifySession("")).toBeNull();
  });
});
