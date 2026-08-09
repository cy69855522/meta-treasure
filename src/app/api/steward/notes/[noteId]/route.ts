import {
  deleteStewardMemoryNote,
  getStewardMemoryNote,
  updateStewardMemoryNote,
} from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ noteId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { noteId } = await params;
  if (!getStewardMemoryNote(noteId)) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const body = (await request.json()) as { title?: string; body?: string };
  const note = updateStewardMemoryNote(noteId, {
    title: body.title,
    body: body.body,
  });
  return Response.json({ note });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { noteId } = await params;
  if (!getStewardMemoryNote(noteId)) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  deleteStewardMemoryNote(noteId);
  return new Response(null, { status: 204 });
}
