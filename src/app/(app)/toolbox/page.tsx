import { ArrowRight, ExternalLink, Flame, Radar, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const TOOLS: Array<{
  name: string;
  url: string;
  host: string;
  icon: LucideIcon;
}> = [
  {
    name: "Deep Radar",
    url: "http://localhost:3433/",
    host: "localhost:3433",
    icon: Radar,
  },
  {
    name: "Hot Radar",
    url: "http://localhost:1315/",
    host: "localhost:1315",
    icon: Flame,
  },
];

export default function ToolboxPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-6">
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Toolbox
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">工具箱</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          独立工具入口；与顾问对话分开，方便直接调用。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <a
              key={tool.name}
              href={tool.url}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-foreground" />
                </div>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  外链
                </span>
              </div>
              <h2 className="mt-3 text-base font-semibold">{tool.name}</h2>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">
                打开 {tool.name} 网页（{tool.host}）。
              </p>
              <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                打开
                <ExternalLink className="size-3.5 opacity-70" />
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </p>
            </a>
          );
        })}
      </div>
    </div>
  );
}
