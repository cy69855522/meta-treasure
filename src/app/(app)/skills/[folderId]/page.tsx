import { notFound } from "next/navigation";
import { getSkillFolder, listSkills } from "@/lib/db";
import { SkillFolderView } from "@/components/skill-folder-view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ folderId: string }> };

export default async function SkillFolderPage({ params }: Params) {
  const { folderId } = await params;
  const folder = getSkillFolder(folderId);
  if (!folder) notFound();

  return (
    <SkillFolderView folder={folder} initialSkills={listSkills(folderId)} />
  );
}
