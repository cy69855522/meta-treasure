import {
  createAgentMemoryNote,
  getProject,
  listAgentMemoryNotes,
} from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return Response.json({ notes: listAgentMemoryNotes(id) });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json()) as { title?: string; body?: string };
  const note = createAgentMemoryNote({
    projectId: id,
    title: body.title?.trim() || "新笔记",
    body: body.body ?? "",
  });
  return Response.json({ note }, { status: 201 });
}
