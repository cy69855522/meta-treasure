import {
  countSkillsInFolder,
  listSkillFolders,
} from "@/lib/db";
import { SkillsLibrary } from "@/components/skills-library";

export const dynamic = "force-dynamic";

export default function SkillsPage() {
  const folders = listSkillFolders().map((folder) => ({
    ...folder,
    skillCount: countSkillsInFolder(folder.id),
  }));

  return <SkillsLibrary initialFolders={folders} />;
}
