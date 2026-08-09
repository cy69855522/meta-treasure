import { NextRequest } from "next/server";
import { reorderProjects } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { orderedIds?: string[] };

  if (!body.orderedIds?.length) {
    return Response.json({ error: "orderedIds required" }, { status: 400 });
  }

  try {
    reorderProjects(body.orderedIds);
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reorder failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
