import { deleteSkill, getSkill, updateSkill } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const skill = getSkill(id);
  if (!skill) {
    return Response.json({ error: "Skill not found" }, { status: 404 });
  }
  return Response.json({ skill });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getSkill(id)) {
    return Response.json({ error: "Skill not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    body?: string;
    folderId?: string;
  };

  try {
    const skill = updateSkill(id, {
      name: body.name,
      description: body.description,
      body: body.body,
      folderId: body.folderId,
    });
    return Response.json({ skill });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!getSkill(id)) {
    return Response.json({ error: "Skill not found" }, { status: 404 });
  }
  deleteSkill(id);
  return new Response(null, { status: 204 });
}
