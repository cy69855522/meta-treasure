import { deleteRule, getRule, updateRule } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const rule = getRule(id);
  if (!rule) {
    return Response.json({ error: "Rule not found" }, { status: 404 });
  }
  return Response.json({ rule });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getRule(id)) {
    return Response.json({ error: "Rule not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    body?: string;
    folderId?: string;
    usageMode?: string;
  };

  try {
    const rule = updateRule(id, {
      name: body.name,
      description: body.description,
      body: body.body,
      folderId: body.folderId,
      usageMode:
        body.usageMode === "required" || body.usageMode === "on_demand"
          ? body.usageMode
          : undefined,
    });
    return Response.json({ rule });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!getRule(id)) {
    return Response.json({ error: "Rule not found" }, { status: 404 });
  }
  deleteRule(id);
  return new Response(null, { status: 204 });
}
