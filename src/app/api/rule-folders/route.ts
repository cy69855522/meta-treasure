import {
  createRuleFolder,
  listRuleFolders,
  countRulesInFolder,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const folders = listRuleFolders().map((folder) => ({
    ...folder,
    ruleCount: countRulesInFolder(folder.id),
  }));
  return Response.json({ folders });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const folder = createRuleFolder({ name: body.name });
    return Response.json(
      { folder: { ...folder, ruleCount: 0 } },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create failed";
    const status = message.includes("已存在") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
