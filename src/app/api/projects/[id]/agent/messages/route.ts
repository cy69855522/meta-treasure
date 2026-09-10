import { getProject, listAgentMessagesPage } from "@/lib/db";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const beforeId = url.searchParams.get("before")?.trim() || undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    100,
    Math.max(
      1,
      limitRaw ? Number.parseInt(limitRaw, 10) || CHAT_HISTORY_PAGE_SIZE : CHAT_HISTORY_PAGE_SIZE,
    ),
  );

  const page = listAgentMessagesPage(id, { limit, beforeId });
  return Response.json(page);
}
