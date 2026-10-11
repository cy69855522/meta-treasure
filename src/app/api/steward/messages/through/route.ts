import { listStewardMessagesThrough } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const throughId = new URL(request.url).searchParams.get("id")?.trim();
  if (!throughId) {
    return Response.json({ error: "缺少消息 id" }, { status: 400 });
  }

  const page = listStewardMessagesThrough(throughId);
  if (!page) {
    return Response.json({ error: "消息不存在" }, { status: 404 });
  }
  return Response.json(page);
}
