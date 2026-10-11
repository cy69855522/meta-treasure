"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { ChatMarkdown } from "@/features/deep-radar/components/chat-markdown";
import { Button } from "@/components/ui/button";
import type {
  KnowledgeFile,
  KnowledgeResource,
  KnowledgeTopic,
  KnowledgeTree,
} from "@/features/deep-radar/lib/knowledge-types";
import { cn } from "@/lib/utils";

type MobileStep = "tree" | "resources" | "preview";

const DOMAIN_LABELS: Record<string, string> = {
  ai_infra: "AI Infra",
  aigc: "AIGC",
  llm: "LLM",
  agent: "Agent",
  engineering: "Engineering",
};

function prettyName(value: string) {
  return value.replaceAll("_", " ");
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
      {errors.map((error) => (
        <p key={error} className="flex gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ))}
    </div>
  );
}

function MetadataPreview({ resource }: { resource: KnowledgeResource }) {
  const metadata = resource.metadata;
  if (!metadata) {
    return <ErrorList errors={resource.errors.length ? resource.errors : ["无法读取元数据"]} />;
  }
  return (
    <article className="space-y-5 p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{metadata.source.type}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{metadata.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {[metadata.source.platform, metadata.source.author, metadata.source.published_at]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">摘要</h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{metadata.summary || "（无摘要）"}</p>
      </div>
      {metadata.key_points.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">关键结论</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {metadata.key_points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {[...metadata.topics, ...metadata.keywords].map((tag) => (
          <span key={tag} className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{tag}</span>
        ))}
      </div>
      {metadata.source.url ? (
        <a className="inline-flex text-sm text-primary underline underline-offset-4" href={metadata.source.url} target="_blank" rel="noreferrer noopener">
          查看原始来源
        </a>
      ) : null}
      <ErrorList errors={resource.errors} />
    </article>
  );
}

function FilePreview({ resource, file }: { resource: KnowledgeResource; file: KnowledgeFile | null }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const url = file ? `/api/deep-radar/knowledge/content?path=${encodeURIComponent(file.path)}` : "";

  useEffect(() => {
    if (!file || !["markdown", "json"].includes(file.kind) || file.name === "metadata.json") return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("文件读取失败");
        setText(await response.text());
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "文件读取失败");
      });
    return () => controller.abort();
  }, [file, url]);

  if (!file || file.name === "metadata.json") return <MetadataPreview resource={resource} />;
  if (error) return <div className="p-5 text-sm text-destructive">{error}</div>;
  if (file.kind === "markdown") {
    return <div className="p-5"><ChatMarkdown content={text || "正在读取…"} /></div>;
  }
  if (file.kind === "json") {
    let formatted = text;
    try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* show original */ }
    return <pre className="m-5 overflow-auto rounded-xl bg-muted p-4 text-xs leading-relaxed">{formatted || "正在读取…"}</pre>;
  }
  if (file.kind === "image") {
    // Local knowledge assets have no reliable dimensions until loaded.
    // eslint-disable-next-line @next/next/no-img-element
    return <div className="flex min-h-full items-center justify-center bg-muted/30 p-5"><img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain" /></div>;
  }
  if (file.kind === "html") {
    return <iframe title={file.name} src={url} sandbox="" className="h-full min-h-[32rem] w-full bg-white" referrerPolicy="no-referrer" />;
  }
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <File className="size-10" />
      <p className="text-sm font-medium text-foreground">{file.name}</p>
      <p className="text-xs">{formatSize(file.size)} · 暂不支持预览</p>
    </div>
  );
}

export function KnowledgeBrowser({ initialTree }: { initialTree: KnowledgeTree }) {
  const firstTopic = initialTree.domains.flatMap((domain) => domain.topics)[0] ?? null;
  const [topic, setTopic] = useState<KnowledgeTopic | null>(firstTopic);
  const [resource, setResource] = useState<KnowledgeResource | null>(firstTopic?.resources[0] ?? null);
  const [file, setFile] = useState<KnowledgeFile | null>(resource?.files[0] ?? null);
  const [openDomains, setOpenDomains] = useState(() => new Set(firstTopic ? [firstTopic.path.split("/")[0]] : []));
  const [step, setStep] = useState<MobileStep>("tree");

  const selectedDomain = useMemo(() => topic?.path.split("/")[0] ?? "", [topic]);

  function chooseTopic(next: KnowledgeTopic) {
    setTopic(next);
    const nextResource = next.resources[0] ?? null;
    setResource(nextResource);
    setFile(nextResource?.files[0] ?? null);
    setStep("resources");
  }

  function chooseResource(next: KnowledgeResource) {
    setResource(next);
    setFile(next.files.find((item) => item.name === "metadata.json") ?? next.files[0] ?? null);
    setStep("preview");
  }

  const treePanel = (
    <section className="min-h-0 overflow-auto border-r bg-muted/20 p-3 lg:block">
      <div className="mb-3 px-2">
        <h1 className="font-semibold">知识库</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">knowledge_base</p>
      </div>
      <ErrorList errors={initialTree.errors} />
      <div className="mt-2 space-y-1">
        {initialTree.domains.map((domain) => {
          const open = openDomains.has(domain.name);
          return (
            <div key={domain.name}>
              <button type="button" className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setOpenDomains((current) => {
                const next = new Set(current);
                if (next.has(domain.name)) next.delete(domain.name); else next.add(domain.name);
                return next;
              })}>
                {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                {open ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
                <span>{DOMAIN_LABELS[domain.name]}</span>
                <span className="ml-auto text-xs text-muted-foreground">{domain.topics.length}</span>
              </button>
              {open ? (
                <div className="ml-5 space-y-0.5 border-l pl-2">
                  {domain.topics.length ? domain.topics.map((item) => (
                    <button key={item.path} type="button" onClick={() => chooseTopic(item)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", topic?.path === item.path && "bg-muted font-medium")}>
                      <Folder className="size-3.5 shrink-0" />
                      <span className="truncate capitalize">{prettyName(item.name)}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{item.resources.length}</span>
                    </button>
                  )) : <p className="px-2 py-2 text-xs text-muted-foreground">暂无主题</p>}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );

  const resourcePanel = (
    <section className="min-h-0 overflow-auto border-r p-4 lg:block">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setStep("tree")}><ArrowLeft /></Button>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{DOMAIN_LABELS[selectedDomain] ?? "选择主题"}</p>
          <h2 className="truncate font-semibold capitalize">{topic ? prettyName(topic.name) : "尚未创建主题"}</h2>
        </div>
      </div>
      {topic ? <ErrorList errors={topic.errors} /> : null}
      <div className="mt-3 space-y-2">
        {topic?.resources.map((item) => (
          <button key={item.path} type="button" onClick={() => chooseResource(item)} className={cn("w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50", resource?.path === item.path && "border-foreground/25 bg-muted/60")}>
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{item.metadata?.title ?? prettyName(item.name)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{[item.metadata?.source.platform, item.metadata?.source.author].filter(Boolean).join(" · ") || "元数据不可用"}</p>
                {item.metadata?.summary ? <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{item.metadata.summary}</p> : null}
              </div>
              {item.errors.length ? <AlertTriangle className="size-4 shrink-0 text-amber-500" /> : null}
            </div>
          </button>
        ))}
        {topic && !topic.resources.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">该主题下暂无资源</div> : null}
        {!topic ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">从左侧选择一个主题</div> : null}
      </div>
    </section>
  );

  const previewPanel = (
    <section className="flex min-h-0 flex-col lg:block">
      <div className="flex min-h-14 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setStep("resources")}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{resource?.metadata?.title ?? (resource ? prettyName(resource.name) : "资源预览")}</p>
          {file ? <p className="text-xs text-muted-foreground">{file.name} · {formatSize(file.size)}</p> : null}
        </div>
        {resource ? (
          <select aria-label="选择文件" value={file?.path ?? ""} onChange={(event) => setFile(resource.files.find((item) => item.path === event.target.value) ?? null)} className="max-w-48 rounded-lg border bg-background px-2 py-1.5 text-xs">
            {resource.files.map((item) => <option key={item.path} value={item.path}>{item.name}</option>)}
          </select>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {resource ? <FilePreview key={file?.path ?? "metadata"} resource={resource} file={file} /> : <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">选择资源后在这里预览</div>}
      </div>
    </section>
  );

  return (
    <div className="h-full min-h-0">
      <div className="hidden h-full min-h-0 grid-cols-[15rem_20rem_minmax(0,1fr)] lg:grid">{treePanel}{resourcePanel}{previewPanel}</div>
      <div className="h-full min-h-0 lg:hidden">
        <div className={cn("h-full", step !== "tree" && "hidden")}>{treePanel}</div>
        <div className={cn("h-full", step !== "resources" && "hidden")}>{resourcePanel}</div>
        <div className={cn("h-full", step !== "preview" && "hidden")}>{previewPanel}</div>
      </div>
    </div>
  );
}
