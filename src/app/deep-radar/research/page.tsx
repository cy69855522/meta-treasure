import { listSessions } from "@/features/deep-radar/lib/db";
import { SessionList } from "@/features/deep-radar/components/session-list";

export const dynamic = "force-dynamic";

export default function ResearchIndexPage() {
  const sessions = listSessions();
  return (
    <div className="flex h-full min-h-0 min-w-0">
      <SessionList sessions={sessions} />
      <div className="hidden min-w-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground md:flex">
        从左侧新建或打开一条研究。进入后我会一次只问一个问题，确认你想查什么。
      </div>
    </div>
  );
}
