import {
  createSkillFolder,
  listSkillFolders,
  countSkillsInFolder,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const folders = listSkillFolders().map((folder) => ({
    ...folder,
    skillCount: countSkillsInFolder(folder.id),
  }));
  return Response.json({ folders });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const folder = createSkillFolder({ name: body.name });
    return Response.json(
      { folder: { ...folder, skillCount: 0 } },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create failed";
    const status = message.includes("已存在") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
