import {
  deleteRuleFolder,
  getRuleFolder,
  updateRuleFolder,
} from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getRuleFolder(id)) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  const body = (await request.json()) as { name?: string; sortOrder?: number };
  try {
    const folder = updateRuleFolder(id, {
      name: body.name,
      sortOrder: body.sortOrder,
    });
    return Response.json({ folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    const status = message.includes("已存在") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!getRuleFolder(id)) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }
  deleteRuleFolder(id);
  return new Response(null, { status: 204 });
}
