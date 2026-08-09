import {
  countRulesInFolder,
  listRuleFolders,
} from "@/lib/db";
import { RulesLibrary } from "@/components/rules-library";

export const dynamic = "force-dynamic";

export default function RulesPage() {
  const folders = listRuleFolders().map((folder) => ({
    ...folder,
    ruleCount: countRulesInFolder(folder.id),
  }));

  return <RulesLibrary initialFolders={folders} />;
}
