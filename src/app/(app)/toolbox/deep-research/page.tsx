"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, LoaderCircle, Search } from "lucide-react";
import type {
  GroupedSearchResult,
  SearchHit,
  SearchSource,
} from "@progress/deep-research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<SearchSource, string> = {
  wechat: "微信公众号",
  zhihu: "知乎",
};

const SOURCE_ORDER: SearchSource[] = ["wechat", "zhihu"];

export default function DeepResearchPage() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GroupedSearchResult | null>(null);
  const [activeSource, setActiveSource] = useState<SearchSource>("wechat");

  useEffect(() => {
    if (!result) return;
    // Prefer first source that has hits or an error message.
    const preferred =
      SOURCE_ORDER.find(
        (s) => (result.groups[s]?.length ?? 0) > 0 || Boolean(result.errors?.[s]),
      ) ?? "wechat";
    setActiveSource(preferred);
  }, [result]);

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = keyword.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/toolbox/deep-research/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q }),
      });
      const data = (await res.json()) as GroupedSearchResult & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "搜索失败");
      }
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  const activeHits = result?.groups[activeSource] ?? [];
  const activeError = result?.errors?.[activeSource];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <Link
          href="/toolbox"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          工具箱
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Deep Research
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          输入关键词，并行搜索微信公众号与知乎（综合相关度排序）。
        </p>
      </header>

      <div className="shrink-0 border-b border-border px-6 py-3">
        <form
          onSubmit={onSubmit}
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入需求 / 关键词…"
            className="min-w-[16rem] flex-1"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !keyword.trim()}>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            搜索
          </Button>
        </form>

        <div
          role="tablist"
          aria-label="搜索来源"
          className="mt-3 flex gap-1"
        >
          {SOURCE_ORDER.map((source) => {
            const count = result?.groups[source]?.length;
            const hasError = Boolean(result?.errors?.[source]);
            const selected = activeSource === source;
            return (
              <button
                key={source}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveSource(source)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  selected
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {SOURCE_LABEL[source]}
                {result ? (
                  <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                    {hasError && (count ?? 0) === 0 ? "!" : (count ?? 0)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!result && !error && !loading ? (
          <p className="text-sm text-muted-foreground">
            提交后可在上方切换来源查看结果。
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在搜索微信与知乎…
          </div>
        ) : null}

        {result && !loading ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              关键词「{result.keyword}」· {SOURCE_LABEL[activeSource]} ·{" "}
              {activeHits.length} 条
            </p>
            <SourceHits hits={activeHits} error={activeError} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SourceHits({
  hits,
  error,
}: {
  hits: SearchHit[];
  error?: string;
}) {
  return (
    <section>
      {error ? (
        <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {hits.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">无结果</p>
      ) : null}
      <ul className="space-y-2">
        {hits.map((hit, index) => (
          <li
            key={`${hit.url}-${hit.rawId ?? index}`}
            className="rounded-xl border border-border px-3 py-2.5"
          >
            <div className="flex items-start gap-3">
              {hit.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hit.coverUrl}
                  alt=""
                  className="mt-0.5 size-14 shrink-0 rounded-md object-cover bg-muted"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">
                      {hit.title}
                      {hit.contentType ? (
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {hit.contentType}
                        </span>
                      ) : null}
                    </p>
                    {hit.snippet ? (
                      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                        {hit.snippet}
                      </p>
                    ) : null}
                  </div>
                  {hit.url ? (
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs",
                        "text-primary hover:bg-muted",
                      )}
                    >
                      打开
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>

                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {hit.author ? <span>作者 {hit.author}</span> : null}
                  {hit.publishedAt ? <span>{hit.publishedAt}</span> : null}
                  {hit.rawId ? (
                    <span className="font-mono opacity-70">id {hit.rawId}</span>
                  ) : null}
                </p>

                {hit.metrics && Object.keys(hit.metrics).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(hit.metrics).map(([label, value]) => (
                      <span
                        key={label}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {label} {formatCount(value)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {hit.meta && Object.keys(hit.meta).length > 0 ? (
                  <dl className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-[auto_1fr]">
                    {Object.entries(hit.meta).map(([label, value]) => {
                      if (label === "封面") return null;
                      return (
                        <div key={label} className="contents">
                          <dt className="pr-2 font-medium text-muted-foreground/80">
                            {label}
                          </dt>
                          <dd className="min-w-0 break-all">{value}</dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}

                {hit.url ? (
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">
                    {hit.url}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) >= 10_000) {
    return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}万`;
  }
  return String(n);
}
