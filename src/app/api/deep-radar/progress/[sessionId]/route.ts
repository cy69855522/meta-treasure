import { progressSnapshot } from "@/features/deep-radar/lib/service";

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
    const progress = progressSnapshot(sessionId);
    if (!progress) {
      return Response.json({ error: "研究会话不存在" }, { status: 404 });
    }
    return Response.json({ progress });
  } catch (error) {
    const message = error instanceof Error ? error.message : "进度获取失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
