import { notFound } from "next/navigation";
import { getRuleFolder, listRules } from "@/lib/db";
import { RuleFolderView } from "@/components/rule-folder-view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ folderId: string }> };

export default async function RuleFolderPage({ params }: Params) {
  const { folderId } = await params;
  const folder = getRuleFolder(folderId);
  if (!folder) notFound();

  return (
    <RuleFolderView folder={folder} initialRules={listRules(folderId)} />
  );
}
