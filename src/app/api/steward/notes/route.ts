import {
  createStewardMemoryNote,
  listStewardMemoryNotes,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ notes: listStewardMemoryNotes() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; body?: string };
  const note = createStewardMemoryNote({
    title: body.title?.trim() || "新笔记",
    body: body.body ?? "",
  });
  return Response.json({ note }, { status: 201 });
}
