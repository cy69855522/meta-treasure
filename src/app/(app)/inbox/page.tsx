import { listProjects, listTasks } from "@/lib/db";
import { InboxBoard } from "@/components/inbox-board";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  const tasks = listTasks({ inboxOnly: true });
  const projects = listProjects();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">收件箱</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          捕捉灵感与突发事件，归理后再进入 Now / Next / Later，不带截止日压力。
        </p>
      </header>
      <InboxBoard tasks={tasks} projects={projects} />
    </div>
  );
}
