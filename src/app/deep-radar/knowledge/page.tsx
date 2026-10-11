import { KnowledgeBrowser } from "@/features/deep-radar/components/knowledge-browser";
import { scanKnowledgeTree } from "@/features/deep-radar/lib/knowledge-base";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  return <KnowledgeBrowser initialTree={await scanKnowledgeTree()} />;
}
