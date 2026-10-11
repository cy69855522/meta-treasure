import { getProject, searchAgentMessages } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  if (!q) {
    return Response.json({ hits: [] });
  }
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    100,
    Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || 40 : 40),
  );

  return Response.json({
    hits: searchAgentMessages(id, q, { limit }),
  });
}
