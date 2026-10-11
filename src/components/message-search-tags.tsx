"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Globe,
  LoaderCircle,
  X,
} from "lucide-react";
import type { InvokedSearch, InvokedSearchHit, InvokedSearchPage } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  wechat: "微信",
  baidu: "百度",
  google: "谷歌",
};

function sourceLabel(source: string) {
  return SOURCE_LABEL[source] || source;
}

export function SearchResultsModal({
  search,
  open,
  onClose,
}: {
  search: InvokedSearch | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tabChoice, setTab] = useState<"hits" | "pages" | null>(null);
  const [pageView, setPageView] = useState<InvokedSearchPage | null>(null);

  if (!open || !search) return null;

  const pages = search.pages || [];
  const visit = search.phase === "visit";
  const tab = visit ? "pages" : tabChoice ?? (search.hits.length === 0 && pages.length ? "pages" : "hits");
  const extractedUrls = new Set(pages.map((page) => page.url));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{visit ? "访问网页" : "网页搜索"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {visit
                ? search.sources.join(" / ")
                : `${search.query || "（无关键词）"}${
                    search.sources?.length
                      ? ` · ${search.sources.map(sourceLabel).join(" / ")}`
                      : ""
                  }`}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
            onClick={() => {
              setPageView(null);
              setTab(null);
              onClose();
            }}
          >
            <X className="size-4" />
          </button>
        </header>

        {pageView ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setPageView(null)}
              >
                <ArrowLeft className="size-3.5" />
                {visit ? "返回列表" : "返回已抽取"}
              </button>
              <a
                href={pageView.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                打开原页
                <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <h3 className="text-sm font-medium">{pageView.title}</h3>
              <p className="mt-1 break-all text-[11px] text-muted-foreground">
                {pageView.url}
              </p>
              {pageView.error ? (
                <p className="mt-3 text-sm text-destructive">{pageView.error}</p>
              ) : (
                <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground/90">
                  {pageView.text || "（无正文）"}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={cn("flex gap-1 border-b px-4 pt-2", visit && "hidden")}>
              <TabButton
                active={tab === "hits"}
                onClick={() => setTab("hits")}
                label={`搜索结果（${search.hits.length}）`}
              />
              <TabButton
                active={tab === "pages"}
                onClick={() => setTab("pages")}
                label={`已抽取（${pages.length}）`}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {tab === "hits" ? (
                search.hits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无搜索结果</p>
                ) : (
                  <ul className="space-y-2">
                    {search.hits.map((hit) => (
                      <HitRow
                        key={`${hit.source}:${hit.url}`}
                        hit={hit}
                        extracted={extractedUrls.has(hit.url)}
                      />
                    ))}
                  </ul>
                )
              ) : pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  模型尚未抽取页面正文
                </p>
              ) : (
                <ul className="space-y-2">
                  {pages.map((page) => (
                    <li key={page.url}>
                      <button
                        type="button"
                        className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/60"
                        onClick={() => setPageView(page)}
                      >
                        <p className="text-sm font-medium leading-snug">
                          {page.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {page.source ? `${sourceLabel(page.source)} · ` : ""}
                          {page.error
                            ? `失败：${page.error}`
                            : `${page.text.trim().length} 字 · 点击查看模型所见正文`}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-t-md px-3 py-1.5 text-xs font-medium",
        active
          ? "border border-b-background bg-background text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function HitRow({
  hit,
  extracted,
}: {
  hit: InvokedSearchHit;
  extracted: boolean;
}) {
  return (
    <li className="rounded-lg border px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{hit.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {sourceLabel(hit.source)}
            {extracted ? " · 已抽取" : ""}
          </p>
          {hit.snippet ? (
            <p className="mt-1 line-clamp-2 text-xs text-foreground/75">
              {hit.snippet}
            </p>
          ) : null}
        </div>
        <a
          href={hit.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
        >
          打开
          <ExternalLink className="size-3" />
        </a>
      </div>
    </li>
  );
}

/** Inline horizontal status bar inside an assistant bubble (streaming-aware). */
export function MessageSearchBar({ search }: { search: InvokedSearch }) {
  const [open, setOpen] = useState(false);
  const status = search.status || (search.hits.length || (search.pages || []).length ? "done" : "searching");
  const pageCount = search.pages?.length || 0;
  const sources = (search.sources || []).map(sourceLabel).filter(Boolean);
  const running = status === "searching" || status === "fetching";
  const allPagesFailed =
    search.phase === "visit" &&
    pageCount > 0 &&
    (search.pages || []).every((page) => page.error);
  const errored = status === "error" || (!running && allPagesFailed);

  let title = "网页搜索";
  let detail = "";
  const failedPages = (search.pages || []).filter((page) => page.error);
  if (search.phase === "visit") {
    const hosts = sources.join(" / ");
    if (running) {
      title = "正在访问网页…";
      detail = hosts;
    } else if (errored) {
      title = "网页读取失败";
      detail = [hosts, failedPages[0]?.error || search.error].filter(Boolean).join(" · ");
    } else {
      title = `已读取 ${pageCount - failedPages.length} 个网页`;
      detail = [
        hosts,
        failedPages.length ? `${failedPages.length} 个失败：${failedPages[0].error}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
  } else if (status === "searching") {
    title = "正在搜索网页…";
    detail = [search.query, sources.join(" / ")].filter(Boolean).join(" · ");
  } else if (status === "fetching") {
    title = "正在抽取网页正文…";
    detail = search.query || `${pageCount || "多"} 个页面`;
  } else if (errored) {
    title = search.phase === "fetch" ? "网页抽取失败" : "网页搜索失败";
    detail = search.error || search.query || "";
  } else if (search.phase === "fetch" || pageCount > 0) {
    title = `已抽取 ${pageCount} 页`;
    detail = search.query
      ? `搜索「${search.query}」· ${search.hits.length} 条`
      : `${search.hits.length} 条候选`;
  } else {
    title = search.query ? `搜索「${search.query}」` : "网页搜索";
    detail = `${search.hits.length} 条结果${sources.length ? ` · ${sources.join(" / ")}` : ""}`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "my-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
          errored
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : running
              ? "border-sky-500/30 bg-sky-500/8 text-sky-800 dark:text-sky-200"
              : "border-sky-500/25 bg-sky-500/8 text-sky-800 hover:bg-sky-500/12 dark:text-sky-200",
        )}
      >
        {running ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
        ) : errored ? (
          <Globe className="size-3.5 shrink-0" />
        ) : (
          <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <Globe className="size-3.5 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate font-medium text-foreground">{title}</span>
          {detail ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {detail}
            </span>
          ) : null}
        </span>
        {!running ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">查看</span>
        ) : null}
      </button>
      <SearchResultsModal
        search={search}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** @deprecated Prefer inline MessageSearchBar in part order */
export function MessageSearchTags({
  searches,
}: {
  searches: InvokedSearch[];
}) {
  if (searches.length === 0) return null;
  return (
    <div className="space-y-0">
      {searches.map((search) => (
        <MessageSearchBar key={search.id} search={search} />
      ))}
    </div>
  );
}
