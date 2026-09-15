import "server-only";
import {
  listRuleFolders,
  listRules,
  listSkillFolders,
  listSkills,
} from "@/lib/db";
import type { LibraryUsageMode } from "@/lib/types";

const USAGE_LABEL: Record<LibraryUsageMode, string> = {
  required: "必须",
  on_demand: "按需",
};

/** Catalog only: folder + skill id/name/description/usageMode (no body). */
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
        ...skills.map((s) => {
          const usage = USAGE_LABEL[s.usageMode];
          return `- ${s.name} (id=${s.id}) [${usage}]: ${s.description.trim() || "（无 description）"}`;
        }),
      ].join("\n");
    })
    .join("\n\n");
}

/** Catalog only: folder + rule id/name/description/usageMode (no body). */
export function buildRulesCatalogBlock(): string {
  const folders = listRuleFolders();
  if (folders.length === 0) return "（规则库为空）";

  return folders
    .map((folder) => {
      const rules = listRules(folder.id);
      const header = `### 文件夹：${folder.name} (id=${folder.id})`;
      if (rules.length === 0) {
        return `${header}\n（无规则）`;
      }
      return [
        header,
        ...rules.map((r) => {
          const usage = USAGE_LABEL[r.usageMode];
          return `- ${r.name} (id=${r.id}) [${usage}]: ${r.description.trim() || "（无 description）"}`;
        }),
      ].join("\n");
    })
    .join("\n\n");
}

export const SKILL_LOAD_PROMPT_LINES = [
  "技能库有两种使用类型：",
  "- 必须使用（目录标注 [必须]）：正文已在本轮「必载技能」中自动注入，每轮回答都必须遵循；不要再 getSkill 这些技能。",
  "- 按需使用（目录标注 [按需]）：下方目录只有 name / description；当用户问题与 description 相关时，先调用 getSkill（传入 skillId）加载完整正文，再依据该技能回复；不相关则不必加载。",
  "加载后对用户说话时用技能名称，不要写出 id。",
] as const;

export const RULE_LOAD_PROMPT_LINES = [
  "规则库有两种使用类型：",
  "- 必须使用（目录标注 [必须]）：正文已在本轮「必载规则」中自动注入，每轮回答都必须遵守；不要再 getRule 这些规则。",
  "- 按需使用（目录标注 [按需]）：下方目录只有 name / description；相关时先 getRule（传入 ruleId）再按规则办事；不相关则不必加载。",
  "加载后对用户说话时用规则名称，不要写出 id。",
] as const;
