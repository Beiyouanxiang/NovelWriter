import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// 服务端密钥环境变量，绝不能出现在客户端构建产物 / 客户端源码里
const SECRET_ENV = [
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "JWT_SECRET",
  "DATABASE_URL",
  "NOVEL_ACCESS_TOKEN",
];

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("API Key / 密钥不进入客户端源码", () => {
  it("components / lib/client / lib/local-db / lib/sync 无服务端密钥", () => {
    const files = [
      ...walk(join(ROOT, "components")),
      ...walk(join(ROOT, "lib", "client")),
      ...walk(join(ROOT, "lib", "local-db")),
      ...walk(join(ROOT, "lib", "sync")),
      ...walk(join(ROOT, "app", "login")),
      ...walk(join(ROOT, "app", "register")),
    ];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      for (const secret of SECRET_ENV) {
        expect(content, `${f} 不应引用 ${secret}`).not.toContain(`process.env.${secret}`);
      }
    }
  });
});
