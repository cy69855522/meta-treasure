import { getProject, listAgentMessagesThrough } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const throughId = new URL(request.url).searchParams.get("id")?.trim();
  if (!throughId) {
    return Response.json({ error: "缺少消息 id" }, { status: 400 });
  }

  const page = listAgentMessagesThrough(id, throughId);
  if (!page) {
    return Response.json({ error: "消息不存在" }, { status: 404 });
  }
  return Response.json(page);
}
