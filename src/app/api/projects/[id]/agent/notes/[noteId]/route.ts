import {
  deleteAgentMemoryNote,
  getAgentMemoryNote,
  getProject,
  updateAgentMemoryNote,
} from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; noteId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id, noteId } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = getAgentMemoryNote(noteId);
  if (!existing || existing.projectId !== id) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const body = (await request.json()) as { title?: string; body?: string };
  const note = updateAgentMemoryNote(noteId, {
    title: body.title,
    body: body.body,
  });
  return Response.json({ note });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, noteId } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = getAgentMemoryNote(noteId);
  if (!existing || existing.projectId !== id) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  deleteAgentMemoryNote(noteId);
  return new Response(null, { status: 204 });
}
