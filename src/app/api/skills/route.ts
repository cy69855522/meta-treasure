import { getSkillFolder, listSkillsByRecentUse } from "@/lib/db";
import { skillCommandName } from "@/lib/skill-commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const skills = listSkillsByRecentUse().map((skill) => ({
    id: skill.id,
    name: skill.name,
    command: skillCommandName(skill.name),
    description: skill.description,
    folderName: getSkillFolder(skill.folderId)?.name || "未分类",
    lastUsedAt: skill.lastUsedAt,
  }));
  return Response.json({ skills });
}
