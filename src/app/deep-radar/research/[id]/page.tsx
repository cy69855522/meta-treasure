import { notFound } from "next/navigation";
import { getSessionBundle, listSessions } from "@/features/deep-radar/lib/db";
import { ResearchChat } from "@/features/deep-radar/components/research-chat";
import { SessionList } from "@/features/deep-radar/components/session-list";

export const dynamic = "force-dynamic";

export default async function ResearchSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = getSessionBundle(id);
  if (!bundle) notFound();
  const sessions = listSessions();

  return (
    <div className="flex h-full min-h-0 min-w-0">
      <div className="hidden h-full min-h-0 md:flex">
        <SessionList sessions={sessions} activeId={id} />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ResearchChat sessionId={id} initial={bundle} />
      </div>
    </div>
  );
}
