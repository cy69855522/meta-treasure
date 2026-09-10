import "server-only";
import {
  listSkillFolders,
  listSkills,
} from "@/lib/db";

/** Catalog only: folder + skill id/name/description (no body). */
export function buildSkillsCatalogBlock(): string {
  const folders = listSkillFolders();
  if (folders.length === 0) return "（技能库为空）";

  return folders
    .map((folder) => {
      const skills = listSkills(folder.id);
      const header = `### 文件夹：${folder.name} (id=${folder.id})`;
      if (skills.length === 0) {
        return `${header}\n（无技能）`;
      }
      return [
        header,
        ...skills.map(
          (s) =>
            `- ${s.name} (id=${s.id}): ${s.description.trim() || "（无 description）"}`,
        ),
      ].join("\n");
    })
    .join("\n\n");
}

export const SKILL_LOAD_PROMPT_LINES = [
  "技能库采用按需加载：下方目录只有 name / description；正文不在快照里。",
  "当用户问题与某条技能的 description 相关时，先调用 getSkill（传入 skillId）加载完整正文，再依据该技能回复；不要仅凭 description 臆造正文。",
  "若不相关则不必加载。加载后对用户说话时用技能名称，不要写出 id。",
] as const;
