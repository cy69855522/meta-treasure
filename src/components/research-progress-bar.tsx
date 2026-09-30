"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  LoaderCircle,
  Radar,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { isRadarMessagePart, type UIMessagePart } from "@/lib/codex-types";
import type { DeepRadarProgress, InvokedRadar } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 1500;

async function loadProgress(sessionId: string): Promise<DeepRadarProgress> {
  const response = await fetch(
    `/api/deep-radar/progress/${encodeURIComponent(sessionId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("进度获取失败");
  const data = (await response.json()) as { progress?: DeepRadarProgress };
  if (!data.progress) throw new Error("进度获取失败");
  return data.progress;
}

function ResearchProgressBar({
  job,
  disabled,
  onReadReport,
}: {
  job: InvokedRadar;
  disabled?: boolean;
  onReadReport?: (job: InvokedRadar) => void;
}) {
  const [progress, setProgress] = useState<DeepRadarProgress | null>(null);
  const [failedFetch, setFailedFetch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollGen = useRef(0);
  const terminal = failedFetch ? "failed" : progress?.terminal ?? "running";
  const running = terminal === "running";
  const done = terminal === "done";
  const failed = terminal === "failed";

  const startPolling = useCallback(() => {
    const gen = ++pollGen.current;
    let timer = 0;

    const tick = async () => {
      if (pollGen.current !== gen) return;
      try {
        const next = await loadProgress(job.sessionId);
        if (pollGen.current !== gen) return;
        setFailedFetch(false);
        setProgress(next);
        if (next.terminal === "running") {
          timer = window.setTimeout(() => void tick(), POLL_MS);
        }
      } catch {
        if (pollGen.current !== gen) return;
        setFailedFetch(true);
      }
    };

    void tick();
    return () => {
      if (pollGen.current === gen) pollGen.current += 1;
      window.clearTimeout(timer);
    };
  }, [job.sessionId]);

  useEffect(() => {
    if (!running) return;
    return startPolling();
  }, [running, startPolling]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    const wasRunning = running;
    pollGen.current += 1;
    try {
      const next = await loadProgress(job.sessionId);
      setFailedFetch(false);
      setProgress(next);
      // Already-running polls were stopped above; restart them here.
      // failed→running is picked up by the running effect instead.
      if (next.terminal === "running" && wasRunning) {
        startPolling();
      }
    } catch {
      setFailedFetch(true);
    } finally {
      setRefreshing(false);
    }
  }

  const label = failedFetch
    ? "进度获取失败"
    : progress?.label || job.title || "Deep Research";
  const href = progress?.reportUrl || progress?.url || job.reportUrl || job.url;
  const percent = progress?.percent;
  const determinate = typeof percent === "number";
  const width = determinate
    ? percent
    : done || failed
      ? 100
      : 35;
  const canRead = done && Boolean(onReadReport) && !disabled;
  const actionClass =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div
      className={cn(
        "flex w-2/3 max-w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
        failed
          ? "border-destructive/35 bg-destructive/5 text-destructive"
          : "border-border/50 bg-background/45 text-foreground",
      )}
    >
      {running || refreshing ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : done ? (
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Radar className="size-3.5 shrink-0 text-muted-foreground" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate font-medium leading-snug">
            {label}
          </p>
          {determinate && running ? (
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
              {percent}%
            </span>
          ) : null}
        </div>
        {!failed ? (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                done ? "bg-foreground/35" : "bg-foreground/25",
                running && !determinate && "animate-pulse",
              )}
              style={{ width: `${width}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          title="刷新进度"
          aria-label="刷新进度"
          disabled={refreshing}
          onClick={() => void refresh()}
          className={actionClass}
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title="在 Deep Radar 打开"
            aria-label="在 Deep Radar 打开"
            className={actionClass}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}

        <button
          type="button"
          title={done ? "读取报告并继续对话" : "研究完成后可读取报告"}
          aria-label="读取报告并继续对话"
          disabled={!canRead}
          onClick={() => {
            if (!canRead || !onReadReport) return;
            onReadReport({
              sessionId: job.sessionId,
              title: progress?.title || job.title,
              url: progress?.url || job.url,
              reportUrl: progress?.reportUrl || job.reportUrl,
            });
          }}
          className={actionClass}
        >
          <ScrollText className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ResearchProgressBars({
  parts,
  disabled,
  onReadReport,
}: {
  parts: UIMessagePart[];
  disabled?: boolean;
  onReadReport?: (job: InvokedRadar) => void;
}) {
  const jobs = parts.filter(isRadarMessagePart);
  if (jobs.length === 0) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      {jobs.map((job) => (
        <ResearchProgressBar
          key={job.sessionId}
          job={job}
          disabled={disabled}
          onReadReport={onReadReport}
        />
      ))}
    </div>
  );
}
