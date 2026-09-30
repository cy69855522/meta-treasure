import { fetchDeepRadarProgress } from "@/lib/deep-radar-client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return Response.json({ error: "缺少研究会话 id" }, { status: 400 });
  }
  try {
    const progress = await fetchDeepRadarProgress(sessionId);
    return Response.json({ progress });
  } catch (error) {
    const message = error instanceof Error ? error.message : "进度获取失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
