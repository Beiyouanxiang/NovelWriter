import { getProviderModels } from "@/lib/server/models";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 返回可用的 provider 与模型列表（不含任何密钥） */
export async function GET() {
  return json(200, { providers: getProviderModels() });
}
