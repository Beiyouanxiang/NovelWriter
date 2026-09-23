import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("哈希后可验证，且哈希不等于明文", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toBe("correct-horse-battery");
    expect(hash).toContain("$2"); // bcrypt 格式
    await expect(verifyPassword("correct-horse-battery", hash)).resolves.toBe(true);
  });

  it("错误密码验证失败", async () => {
    const hash = await hashPassword("secret-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
