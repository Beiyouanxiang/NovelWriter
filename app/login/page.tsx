"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f3ec] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-[#e7e2d8] bg-[#fbfaf7] p-8 shadow-sm"
      >
        <h1 className="mb-6 text-center text-xl font-semibold text-[#2b2a27]">
          登录小说创作工作台
        </h1>
        <div className="space-y-4">
          <div>
            <label className="field-label">邮箱</label>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">密码</label>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
          <p className="text-center text-sm text-[#6b675f]">
            还没有账号？{" "}
            <Link href="/register" className="text-[#8a5a44] hover:underline">
              注册
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
