import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { CSRF_COOKIE } from "@/lib/auth/csrf";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
  return json(200, { ok: true });
}
