import { NextRequest } from "next/server";
import { reorderSkillFolders } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { orderedIds?: string[] };

  if (!body.orderedIds?.length) {
    return Response.json({ error: "orderedIds required" }, { status: 400 });
  }

  reorderSkillFolders(body.orderedIds);
  return Response.json({ ok: true });
}
