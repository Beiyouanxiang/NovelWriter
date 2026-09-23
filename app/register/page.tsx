"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    setBusy(true);
    try {
      await register(email, password, displayName);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
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
          注册账号
        </h1>
        <div className="space-y-4">
          <div>
            <label className="field-label">昵称</label>
            <input
              className="field-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="可选"
            />
          </div>
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
            <label className="field-label">密码（至少 8 位）</label>
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
            {busy ? "注册中…" : "注册"}
          </button>
          <p className="text-center text-sm text-[#6b675f]">
            已有账号？{" "}
            <Link href="/login" className="text-[#8a5a44] hover:underline">
              登录
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
