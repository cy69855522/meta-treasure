"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Maximize2,
  Star,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/features/deep-radar/components/chat-markdown";
import { candyClassFor, extractEqualsMarks, mergeKeywords, splitByKeywords } from "@/features/deep-radar/lib/candy-highlight";
import { withInlineCites } from "@/features/deep-radar/lib/cite-links";
import {
  buildReportHtmlDocument,
  downloadTextFile,
  reportDisplayTitle,
  reportDownloadFilename,
} from "@/features/deep-radar/lib/report-html";
import { outlinePoints } from "@/features/deep-radar/lib/research-outline";
import { cn } from "@/lib/utils";
import { SOURCE_TITLE } from "@/features/deep-radar/lib/settings-types";
import type { Outline, Report, ReportPlan, ResearchLink } from "@/features/deep-radar/lib/research-types";

export function OutlineCard({
  outline,
  pending,
  onApprove,
  onRevise,
}: {
  outline: Outline;
  pending?: boolean;
  onApprove?: () => void;
  onRevise?: () => void;
}) {
  const points = outlinePoints(outline);
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">搜索纲要</p>
      <p className="text-base leading-relaxed">{outline.goal}</p>
      {points.length > 0 ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ol>
      ) : null}
      {outline.exclusions.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          排除：{outline.exclusions.join("、")}
        </p>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onApprove}>
            批准
          </Button>
          <Button type="button" variant="outline" onClick={onRevise}>
            按我的修改重拟
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">已批准</p>
      )}
    </div>
  );
}

export function RoundCard({
  query,
  queryZh,
  queryEn,
  targetQuestion,
  summary,
  analysis,
  cited,
  unused,
  index,
  keywords,
  catalog,
}: {
  query: string;
  queryZh?: string;
  queryEn?: string;
  targetQuestion?: string;
  summary: string;
  analysis: string;
  cited: ResearchLink[];
  unused: ResearchLink[];
  index: number;
  keywords?: string[];
  catalog?: ResearchLink[];
}) {
  const zh = (queryZh || query).trim();
  const en = (queryEn || query).trim();
  const question = (targetQuestion || "").trim();
  const related = unused.filter((link) => link.relevant !== false);
  const unrelated = unused.filter((link) => link.relevant === false);
  const terms = mergeKeywords(
    keywords,
    ...[summary, analysis, question].map((text) => {
      const marks = text.match(/==([^=\n]+)==/g) ?? [];
      return marks.map((row) => row.slice(2, -2));
    }),
  );
  const citeCatalog = catalog?.length ? catalog : [...cited, ...unused];
  return (
    <div className="min-w-0 space-y-4">
      <div>
        <p className="text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          第 {index + 1} 轮
        </p>
        {question ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            <CandyText text={question} keywords={terms} />
          </p>
        ) : null}
      </div>
      <RoundBlock label="搜索词">
        <p className="text-sm leading-relaxed">中文：{zh || "（无）"}</p>
        <p className="text-sm leading-relaxed">英文：{en || "（无）"}</p>
      </RoundBlock>
      <RoundBlock label="目标问题">
        <p className="text-sm leading-relaxed">
          <CandyText text={question || zh} keywords={terms} />
        </p>
      </RoundBlock>
      <RoundBlock label="搜索结果">
        <ChatMarkdown
          content={analysis}
          className="text-sm"
          keywords={terms}
          citeCatalog={citeCatalog}
        />
      </RoundBlock>
      <RoundBlock label="资料总结">
        <ChatMarkdown
          content={summary}
          className="text-sm"
          keywords={terms}
          citeCatalog={citeCatalog}
        />
      </RoundBlock>
      <FoldSection
        label={`引用 · ${cited.length}`}
        count={cited.length}
        tone="cited"
      >
        {cited.map((link) => (
          <LinkCard key={link.url} link={link} tone="cited" />
        ))}
      </FoldSection>
      <FoldSection
        label={`未引用 · 相关 ${related.length}`}
        count={related.length}
        tone="related"
      >
        {related.map((link) => (
          <LinkCard key={link.url} link={link} tone="related" />
        ))}
      </FoldSection>
      <FoldSection
        label={`未引用 · 无关 ${unrelated.length}`}
        count={unrelated.length}
        tone="unrelated"
      >
        {unrelated.map((link) => (
          <LinkCard key={link.url} link={link} tone="unrelated" />
        ))}
      </FoldSection>
    </div>
  );
}

function RoundBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div>{children}</div>
    </section>
  );
}

function FoldSection({
  label,
  count,
  tone = "muted",
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  tone?: "cited" | "related" | "unrelated" | "muted";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-left text-xs hover:bg-background/70",
          tone === "cited" &&
            "font-medium text-sky-800 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200",
          tone === "related" &&
            "font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200",
          tone === "unrelated" &&
            "font-medium text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200",
          tone === "muted" && "text-muted-foreground hover:text-foreground",
        )}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        {label}
      </button>
      {open ? <div className="space-y-2">{children}</div> : null}
    </div>
  );
}

export function LinkCard({
  link,
  tone = "muted",
}: {
  link: ResearchLink;
  tone?: "cited" | "related" | "unrelated" | "muted";
}) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "block min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 transition-colors",
        tone === "cited" &&
          "border-sky-300 bg-sky-50 hover:bg-sky-100/80 dark:border-sky-500/40 dark:bg-sky-500/15 dark:hover:bg-sky-500/25",
        tone === "related" &&
          "border-emerald-300 bg-emerald-50 hover:bg-emerald-100/80 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25",
        tone === "unrelated" &&
          "border-red-300 bg-red-50 hover:bg-red-100/80 dark:border-red-500/40 dark:bg-red-500/15 dark:hover:bg-red-500/25",
        tone === "muted" &&
          "border-border/70 bg-background/70 hover:bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-snug break-words">
          {link.title}
        </p>
        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className={
            tone === "cited"
              ? "border-sky-300/80 bg-sky-100/80 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-100"
              : tone === "related"
                ? "border-emerald-300/80 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-100"
                : tone === "unrelated"
                  ? "border-red-300/80 bg-red-100/80 text-red-900 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-100"
                  : undefined
          }
        >
          {SOURCE_TITLE[link.source] ?? link.source}
        </Badge>
        {tone === "cited" ? (
          <Badge className="border-transparent bg-sky-600 text-white dark:bg-sky-400 dark:text-sky-950">
            引用
          </Badge>
        ) : tone === "related" ? (
          <Badge className="border-transparent bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950">
            相关
          </Badge>
        ) : tone === "unrelated" ? (
          <Badge className="border-transparent bg-red-600 text-white dark:bg-red-400 dark:text-red-950">
            无关
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">未引用</span>
        )}
        {link.author ? (
          <span className="text-xs text-muted-foreground">{link.author}</span>
        ) : null}
      </div>
      {link.reason ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {link.reason}
        </p>
      ) : null}
      {tone !== "cited" && link.snippet ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {link.snippet}
        </p>
      ) : null}
    </a>
  );
}

export function ReportPlanCard({
  plan,
  catalog,
}: {
  plan: ReportPlan;
  catalog?: ResearchLink[];
}) {
  const keywords = mergeKeywords(
    plan.keywords,
    extractEqualsMarks(plan.markdown).marks,
  );
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm font-medium">报告撰写计划</p>
      {plan.title ? (
        <p className="text-base font-semibold break-words">{plan.title}</p>
      ) : null}
      <ChatMarkdown
        content={plan.markdown}
        keywords={keywords}
        citeCatalog={catalog}
      />
    </div>
  );
}

export function ReportCard({
  report,
  catalog,
  className,
  density = "chat",
  showHeading = true,
}: {
  report: Report;
  catalog: ResearchLink[];
  className?: string;
  /** chat = bubble; page = fullscreen / export reading measure */
  density?: "chat" | "page";
  showHeading?: boolean;
}) {
  const page = density === "page";
  const markdown = report.markdown?.trim();
  if (markdown) {
    const keywords = mergeKeywords(
      report.keywords,
      extractEqualsMarks(markdown).marks,
    );
    return (
      <div
        className={cn(
          "min-w-0",
          page ? "space-y-5 text-[1.05rem] leading-[1.8]" : "space-y-4",
          className,
        )}
      >
        {showHeading ? (
          <p
            className={cn(
              "font-medium text-muted-foreground",
              page ? "text-xs tracking-wide uppercase" : "text-sm text-foreground",
            )}
          >
            研究报告
          </p>
        ) : null}
        <ChatMarkdown
          content={markdown}
          keywords={keywords}
          citeCatalog={catalog}
          className={page ? "[&_h1]:text-[clamp(1.6rem,2.2vw,2.1rem)] [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-xl [&_p]:leading-[1.8]" : undefined}
        />
      </div>
    );
  }
  const conclusions = report.conclusions ?? [];
  const keywords = mergeKeywords(
    report.keywords,
    ...conclusions.map((item) => {
      const marks = item.notes.match(/==([^=\n]+)==/g) ?? [];
      return marks.map((row) => row.slice(2, -2));
    }),
  );
  return (
    <div
      className={cn(
        "min-w-0",
        page ? "space-y-8 text-[1.05rem] leading-[1.8]" : "space-y-6",
        className,
      )}
    >
      {showHeading ? (
        <p
          className={cn(
            "font-medium text-muted-foreground",
            page ? "text-xs tracking-wide uppercase" : "text-sm text-foreground",
          )}
        >
          研究报告
        </p>
      ) : null}
      {conclusions.map((item, index) => (
        <section key={`${item.headline}-${index}`} className="min-w-0 space-y-3">
          <h3
            className={cn(
              "font-semibold break-words",
              page ? "text-xl" : "text-base",
            )}
          >
            {index + 1}. <CandyText text={item.headline} keywords={keywords} />
          </h3>
          <ChatMarkdown
            content={withInlineCites(item.notes, item.links, catalog)}
            keywords={keywords}
            citeCatalog={catalog}
          />
        </section>
      ))}
      <section
        className={cn(
          "rounded-xl border border-border/70 bg-background/80",
          page ? "px-5 py-4" : "px-3 py-3",
        )}
      >
        <p className="text-sm font-medium">判断</p>
        <div className="mt-1">
          <ChatMarkdown
            content={report.judgment ?? ""}
            keywords={keywords}
            citeCatalog={catalog}
          />
        </div>
        <p className="mt-3 text-sm font-medium">行动路线</p>
        <div className="mt-1">
          <ChatMarkdown
            content={report.actionPath ?? ""}
            keywords={keywords}
            citeCatalog={catalog}
          />
        </div>
      </section>
    </div>
  );
}

export async function downloadReportHtml(
  report: Report,
  catalog: ResearchLink[],
) {
  const title = reportDisplayTitle(report);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1200px;pointer-events:none;opacity:0;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(
      <ReportCard
        report={report}
        catalog={catalog}
        density="page"
        showHeading={false}
      />,
    );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const bodyHtml = host.innerHTML;
    const html = buildReportHtmlDocument({ title, bodyHtml });
    downloadTextFile(
      reportDownloadFilename(title),
      html,
      "text/html;charset=utf-8",
    );
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Full-viewport reader — full-bleed width, matching HTML export. */
export function ReportFullscreen({
  report,
  catalog,
  open,
  onClose,
  favorited = false,
  onToggleFavorite,
}: {
  report: Report;
  catalog: ResearchLink[];
  open: boolean;
  onClose: () => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const title = reportDisplayTitle(report);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const onDownload = useCallback(() => {
    void downloadReportHtml(report, catalog);
  }, [report, catalog]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="研究报告全屏"
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/95 px-5 py-3 backdrop-blur-md md:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Deep Radar · 研究报告
            </p>
            <h2 className="truncate text-base font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onToggleFavorite ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={favorited ? "取消收藏" : "收藏报告"}
                title={favorited ? "取消收藏" : "收藏报告"}
                onClick={onToggleFavorite}
                className={
                  favorited
                    ? "text-amber-500 hover:text-amber-600"
                    : undefined
                }
              >
                <Star className={favorited ? "fill-current" : undefined} />
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="下载 HTML"
              title="下载 HTML"
              onClick={onDownload}
            >
              <Download />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="退出全屏"
              title="退出全屏"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 lg:px-10">
          <ReportCard
            report={report}
            catalog={catalog}
            density="page"
            showHeading={false}
          />
        </article>
      </div>
    </div>,
    document.body,
  );
}

export function ReportBubbleShell({
  children,
  className,
  onExpand,
  onDownload,
  favorited = false,
  onToggleFavorite,
}: {
  children: ReactNode;
  className?: string;
  onExpand: () => void;
  onDownload: () => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 w-full max-w-[min(92%,100%)] overflow-hidden rounded-2xl rounded-bl-md",
        "border border-sky-300/70 bg-gradient-to-br from-sky-50/95 via-sky-50/40 to-card",
        "shadow-[0_0_0_1px_rgba(125,211,252,0.35),0_0_28px_-4px_rgba(56,189,248,0.45),0_12px_32px_-20px_rgba(14,165,233,0.35)]",
        "dark:border-sky-400/30 dark:from-sky-950/50 dark:via-sky-950/20 dark:to-card",
        "dark:shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_0_32px_-6px_rgba(56,189,248,0.35)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-sky-200/80 bg-sky-50/80 px-4 py-2.5 dark:border-sky-500/25 dark:bg-sky-950/40">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-700 ring-1 ring-sky-300/70 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-400/40">
            <FileText className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold tracking-wide text-sky-900 uppercase dark:text-sky-100">
              研究报告
            </p>
            <p className="truncate text-[10px] text-sky-700/75 dark:text-sky-200/70">
              Deep Radar · Report
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-sky-200/80 bg-white/75 p-0.5 dark:border-sky-500/30 dark:bg-sky-950/45">
          {onToggleFavorite ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className={cn(
                "hover:bg-sky-100/80 hover:text-sky-950 dark:hover:bg-sky-500/20",
                favorited
                  ? "text-amber-500 hover:text-amber-600 dark:text-amber-400"
                  : "text-sky-800 dark:text-sky-100",
              )}
              title={favorited ? "取消收藏" : "收藏报告"}
              aria-label={favorited ? "取消收藏" : "收藏报告"}
              aria-pressed={favorited}
              onClick={onToggleFavorite}
            >
              <Star className={favorited ? "fill-current" : undefined} />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-sky-800 hover:bg-sky-100/80 hover:text-sky-950 dark:text-sky-100 dark:hover:bg-sky-500/20"
            title="下载 HTML"
            aria-label="下载 HTML"
            onClick={onDownload}
          >
            <Download />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-sky-800 hover:bg-sky-100/80 hover:text-sky-950 dark:text-sky-100 dark:hover:bg-sky-500/20"
            title="全屏阅读"
            aria-label="全屏阅读"
            onClick={onExpand}
          >
            <Maximize2 />
          </Button>
        </div>
      </div>
      <div className="relative px-5 pb-9 pt-4">{children}</div>
    </div>
  );
}

function CandyText({
  text,
  keywords,
}: {
  text: string;
  keywords: string[];
}) {
  const pieces = splitByKeywords(text, keywords);
  if (pieces.length === 1 && !pieces[0]?.hit) return <>{text}</>;
  return (
    <>
      {pieces.map((piece, index) =>
        piece.hit ? (
          <mark
            key={`${piece.hit}-${index}`}
            className={cn(
              "rounded-[0.2em] px-0.5 py-px [box-decoration-break:clone]",
              candyClassFor(piece.hit),
            )}
          >
            {piece.text}
          </mark>
        ) : (
          piece.text
        ),
      )}
    </>
  );
}
