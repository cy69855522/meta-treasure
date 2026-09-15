import { checkOrigin, getCodexModels } from "@/lib/codex-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    checkOrigin(request);
    return Response.json({ options: await getCodexModels() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取 Codex 配置" }, { status: 400 });
  }
}
