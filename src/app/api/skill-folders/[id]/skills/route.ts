import {
  createSkill,
  getSkillFolder,
  listSkills,
} from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!getSkillFolder(id)) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }
  return Response.json({ skills: listSkills(id) });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getSkillFolder(id)) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    body?: string;
    usageMode?: string;
  };

  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const skill = createSkill({
      folderId: id,
      name: body.name,
      description: body.description,
      body: body.body,
      usageMode:
        body.usageMode === "required" || body.usageMode === "on_demand"
          ? body.usageMode
          : undefined,
    });
    return Response.json({ skill }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}
