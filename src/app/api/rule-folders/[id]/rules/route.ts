import {
  createRule,
  getRuleFolder,
  listRules,
} from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!getRuleFolder(id)) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }
  return Response.json({ rules: listRules(id) });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getRuleFolder(id)) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    body?: string;
  };

  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const rule = createRule({
      folderId: id,
      name: body.name,
      description: body.description,
      body: body.body,
    });
    return Response.json({ rule }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}
