"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/features/deep-radar/components/chat-composer";
import { MessageImages } from "@/features/deep-radar/components/message-images";
import { MessageRetryButton } from "@/features/deep-radar/components/message-retry-button";
import { MessageRewindButton } from "@/features/deep-radar/components/message-rewind-button";
import { ChatMarkdown } from "@/features/deep-radar/components/chat-markdown";
import {
  OutlineCard,
  ReportBubbleShell,
  ReportCard,
  ReportFullscreen,
  ReportPlanCard,
  RoundCard,
  downloadReportHtml,
} from "@/features/deep-radar/components/research-cards";
import { CiteDialogHost } from "@/features/deep-radar/components/cite-tag";
import { useStickToBottomScroll } from "@/hooks/use-stick-to-bottom-scroll";
import { CHAT_POLL_MS } from "@/features/deep-radar/lib/constants";
import {
  canStop,
  composerDisabled,
  type ChatMessage,
  type DraftRound,
  type Outline,
  type Report,
  type ReportPlan,
  type ResearchLink,
  type ResearchRound,
  type ResearchSession,
} from "@/features/deep-radar/lib/research-types";
import { appendComposerDraft, lostUserQuestion } from "@/features/deep-radar/lib/research-rewind";
import { cn } from "@/lib/utils";

type Bundle = {
  session: ResearchSession;
  messages: ChatMessage[];
  busy?: boolean;
};

/** Cheap fingerprint so idle polls do not remount bubbles / clear selection. */
function bundleSyncKey(bundle: Bundle) {
  const st = bundle.session.state;
  const rw = st.reportWrite;
  const draft = st.draftRound;
  return [
    bundle.session.title,
    bundle.busy ? "1" : "0",
    st.phase,
    st.error ?? "",
    st.stopRequested ? "1" : "0",
    rw ? `${rw.turn}/${rw.maxTurns}` : "",
    draft ? `${draft.step}:${draft.query ?? ""}` : "",
    st.pendingCommands.map((cmd) => cmd.type).join(","),
    String(st.links.length),
    ...bundle.messages.map((message) => {
      let extra = "";
      if (message.kind === "report") {
        extra = String(
          (message.payload as Report | undefined)?.markdown?.length ?? 0,
        );
      } else if (message.kind === "report_plan") {
        extra = String(
          (message.payload as ReportPlan | undefined)?.markdown?.length ?? 0,
        );
      } else if (message.kind === "round") {
        const round = (message.payload as { round?: ResearchRound } | undefined)
          ?.round;
        extra = String(
          (round?.summary ?? round?.findings ?? "").length +
            (round?.analysis ?? round?.gaps ?? "").length,
        );
      }
      return `${message.id}:${message.kind}:${message.content.length}:${message.content.slice(0, 48)}:${extra}`;
    }),
  ].join("\0");
}

export function ResearchChat({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: Bundle;
}) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [rewinding, setRewinding] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [draft, setDraft] = useState("");
  const phase = bundle.session.state.phase;
  const loopBusy =
    Boolean(bundle.busy) ||
    sending ||
    composerDisabled(phase) ||
    bundle.session.state.pendingCommands.length > 0;
  const busy = loopBusy || rewinding || stopping;
  const showStop = canStop(phase, loopBusy) && !rewinding && !stopping;

  const lastContent = bundle.messages.at(-1)?.content ?? "";
  const { scrollRef, onScroll, pinToBottom } = useStickToBottomScroll({
    contentKey: `${bundle.messages.length}:${phase}:${lastContent.length}:${busy}`,
  });
  const syncKeyRef = useRef(bundleSyncKey(initial));

  function applyBundle(data: Bundle) {
    syncKeyRef.current = bundleSyncKey(data);
    setBundle(data);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#report") return;
    const timer = window.setTimeout(() => {
      document.getElementById("report")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [sessionId, bundle.messages.length]);

  useEffect(() => {
    syncKeyRef.current = bundleSyncKey(initial);
    setBundle(initial);
  }, [initial]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/deep-radar/research/${sessionId}`, {
          cache: "no-store",
        });
        if (res.status === 404) return;
        const data = (await res.json()) as Bundle & { error?: string };
        if (!res.ok) throw new Error(data.error || "无法同步研究会话");
        if (!alive) return;
        const nextKey = bundleSyncKey(data);
        if (nextKey === syncKeyRef.current) return;
        applyBundle(data);
      } catch (cause) {
        if (alive) {
          setError(cause instanceof Error ? cause.message : "同步失败");
        }
      }
    };
    void poll();
    const timer = window.setInterval(poll, CHAT_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  async function rewind(messageId: string, mode: "rewind" | "retry") {
    const target = bundle.messages.find((message) => message.id === messageId);
    const restore =
      mode === "rewind" && target?.role === "user"
        ? lostUserQuestion(bundle.messages, messageId)
        : "";
    setRewinding(true);
    setError(null);
    try {
      const res = await fetch(`/api/deep-radar/research/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          messageId,
        }),
      });
      const data = (await res.json()) as Bundle & { error?: string };
      if (!res.ok || !data.session) throw new Error(data.error || "操作失败");
      applyBundle(data);
      if (restore) setDraft((current) => appendComposerDraft(current, restore));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setRewinding(false);
    }
  }

  async function stop() {
    setStopping(true);
    setError(null);
    try {
      const res = await fetch(`/api/deep-radar/research/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = (await res.json()) as Bundle & { error?: string };
      if (!res.ok || !data.session) throw new Error(data.error || "停止失败");
      applyBundle(data);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "停止失败");
    } finally {
      setStopping(false);
    }
  }

  async function post(body: object) {
    setSending(true);
    setError(null);
    pinToBottom();
    try {
      const res = await fetch(`/api/deep-radar/research/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Bundle & { error?: string };
      if (!res.ok) throw new Error(data.error || "操作失败");
      applyBundle(data);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setSending(false);
    }
  }

  async function toggleFavorite() {
    setError(null);
    const next = !Boolean(bundle.session.favoritedAt);
    try {
      const res = await fetch(`/api/deep-radar/research/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "favorite", favorited: next }),
      });
      const data = (await res.json()) as Bundle & {
        error?: string;
        favorited?: boolean;
      };
      if (!res.ok || !data.session) throw new Error(data.error || "收藏失败");
      applyBundle(data);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "收藏失败");
    }
  }

  const reportFavorited = Boolean(bundle.session.favoritedAt);

  const pendingOutlineId = useMemo(() => {
    if (
      phase !== "outline_pending" &&
      phase !== "supplement_pending"
    ) {
      return null;
    }
    return [...bundle.messages].reverse().find((m) => m.kind === "outline")?.id;
  }, [bundle.messages, phase]);

  const visibleMessages = useMemo(
    () => bundle.messages.filter(isVisibleChatMessage),
    [bundle.messages],
  );
  const recoverableStatusId = useMemo(() => {
    if (busy || phase !== "paused") return null;
    return [...bundle.messages]
      .reverse()
      .find(
        (message) =>
          message.kind === "status" && message.content.includes("已冻结"),
      )?.id;
  }, [bundle.messages, busy, phase]);

  const statusText = statusLabel(
    phase,
    busy,
    bundle.session.state.draftRound?.step,
    bundle.session.state.pendingCommands[0]?.type,
    bundle.session.state.reportWrite,
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex h-11 shrink-0 items-center border-b border-border px-4 md:px-6">
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">
          {bundle.session.title}
        </h1>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 md:px-6"
      >
        <div className="w-full min-w-0 space-y-4">
        {visibleMessages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            先说你想查什么。我会一次只问一个问题，确认后再整理搜索纲要。
          </div>
        ) : null}

        {visibleMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            anchorId={
              message.kind === "report" &&
              message.id ===
                [...visibleMessages].reverse().find((item) => item.kind === "report")
                  ?.id
                ? "report"
                : undefined
            }
            catalog={bundle.session.state.links}
            outlinePending={message.id === pendingOutlineId}
            busy={sending || rewinding}
            rewindDisabled={rewinding}
            reportFavorited={reportFavorited}
            onToggleFavorite={() => void toggleFavorite()}
            onApprove={() => void post({ action: "approve" })}
            onRevise={() => {
              const feedback = window.prompt("想怎么改这份纲要？");
              if (feedback?.trim()) {
                void post({ action: "revise", feedback });
              }
            }}
            onRewind={() => void rewind(message.id, "rewind")}
            onRetry={
              message.kind === "status"
                ? undefined
                : () => void rewind(message.id, "retry")
            }
            onContinue={
              message.id === recoverableStatusId
                ? () => void post({ action: "continue" })
                : undefined
            }
          />
        ))}

        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        </div>
      </div>
      <CiteDialogHost />

      {statusText || stopping ? (
        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground md:px-6">
          <LoaderCircle className="size-3 animate-spin" />
          <span className="min-w-0 flex-1">
            {statusText || "正在停止…"}
          </span>
          {showStop || stopping ? (
            <button
              type="button"
              className="shrink-0 underline-offset-2 hover:underline disabled:opacity-60"
              disabled={stopping}
              onClick={() => void stop()}
            >
              {stopping ? "停止中" : "停止"}
            </button>
          ) : null}
        </div>
      ) : null}

      <ChatComposer
        placeholder={
          composerDisabled(phase)
            ? "研究进行中…"
            : "输入研究问题或回答追问，也可以贴图…"
        }
        disabled={busy}
        value={draft}
        onChange={setDraft}
        onSubmit={({ text, images }) =>
          void post({ action: "message", text, images })
        }
      />
    </div>
  );
}

function MessageBubble({
  message,
  anchorId,
  catalog,
  outlinePending,
  busy,
  rewindDisabled,
  reportFavorited,
  onToggleFavorite,
  onApprove,
  onRevise,
  onRewind,
  onRetry,
  onContinue,
}: {
  message: ChatMessage;
  anchorId?: string;
  catalog: ResearchLink[];
  outlinePending: boolean;
  busy: boolean;
  rewindDisabled: boolean;
  reportFavorited?: boolean;
  onToggleFavorite?: () => void;
  onApprove: () => void;
  onRevise: () => void;
  onRewind: () => void;
  onRetry?: () => void;
  onContinue?: () => void;
}) {
  const [reportFullscreen, setReportFullscreen] = useState(false);
  const isUser = message.role === "user";
  const isReport = message.kind === "report";
  const report = isReport ? (message.payload as Report) : null;

  const body = (
    <>
      {!isUser && !isReport ? (
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          Deep Radar
        </p>
      ) : null}
      {message.kind === "outline" ? (
        <OutlineCard
          outline={message.payload as Outline}
          pending={outlinePending}
          onApprove={onApprove}
          onRevise={onRevise}
        />
      ) : message.kind === "round" ? (
        <RoundCard
          index={(message.payload as { round: ResearchRound }).round.index}
          query={(message.payload as { round: ResearchRound }).round.query}
          queryZh={(message.payload as { round: ResearchRound }).round.queryZh}
          queryEn={(message.payload as { round: ResearchRound }).round.queryEn}
          targetQuestion={
            (message.payload as { round: ResearchRound }).round.targetQuestion
          }
          summary={
            (message.payload as { round: ResearchRound }).round.summary ??
            (message.payload as { round: ResearchRound }).round.findings
          }
          analysis={
            (message.payload as { round: ResearchRound }).round.analysis ??
            (message.payload as { round: ResearchRound }).round.gaps
          }
          cited={(message.payload as { cited: ResearchLink[] }).cited ?? []}
          unused={(message.payload as { unused: ResearchLink[] }).unused ?? []}
          keywords={(message.payload as { round: ResearchRound }).round.keywords}
          catalog={catalog}
        />
      ) : message.kind === "report_plan" ? (
        <ReportPlanCard
          plan={message.payload as ReportPlan}
          catalog={catalog}
        />
      ) : isReport && report ? (
        <ReportCard report={report} catalog={catalog} showHeading={false} />
      ) : (
        <>
          {isUser ? <MessageImages images={message.images} /> : null}
          {message.content.trim() ? (
            <ChatMarkdown
              content={message.content}
              variant={isUser ? "user" : "assistant"}
            />
          ) : null}
          {onContinue ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={busy}
              onClick={onContinue}
            >
              {message.content.startsWith("撰写报告出错")
                ? "继续撰写报告"
                : "继续研究"}
            </Button>
          ) : null}
        </>
      )}
      <div className="absolute bottom-1.5 right-2 flex gap-0.5">
        {onRetry ? (
          <MessageRetryButton
            disabled={busy}
            onRetry={onRetry}
            tone={isUser ? "onPrimary" : "default"}
            keepMessage={isUser}
          />
        ) : null}
        <MessageRewindButton
          disabled={rewindDisabled}
          onRewind={onRewind}
          tone={isUser ? "onPrimary" : "default"}
          restoreToComposer={isUser}
        />
      </div>
    </>
  );

  return (
    <div
      id={anchorId}
      className={cn(
        "flex min-w-0",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {isReport && report ? (
        <ReportBubbleShell
          onExpand={() => setReportFullscreen(true)}
          onDownload={() => void downloadReportHtml(report, catalog)}
          favorited={reportFavorited}
          onToggleFavorite={onToggleFavorite}
        >
          {body}
          <ReportFullscreen
            report={report}
            catalog={catalog}
            open={reportFullscreen}
            onClose={() => setReportFullscreen(false)}
            favorited={reportFavorited}
            onToggleFavorite={onToggleFavorite}
          />
        </ReportBubbleShell>
      ) : (
        <div
          className={cn(
            "relative min-w-0 break-words rounded-2xl px-5 pb-9 pt-3 shadow-sm",
            isUser
              ? "max-w-[min(92%,100%)] rounded-br-md bg-primary text-primary-foreground"
              : "w-full max-w-[min(92%,100%)] rounded-bl-md border border-border/80 bg-card text-card-foreground",
          )}
        >
          {body}
        </div>
      )}
    </div>
  );
}

function isVisibleChatMessage(message: ChatMessage) {
  if (message.kind !== "status") return true;
  return (
    message.content.startsWith("本轮循环出错") ||
    message.content.startsWith("撰写报告出错") ||
    message.content.startsWith("出错了")
  );
}

function statusLabel(
  phase: ResearchSession["state"]["phase"],
  busy: boolean,
  step?: DraftRound["step"],
  pending?: string,
  reportWrite?: { turn: number; maxTurns: number } | null,
): string | null {
  if (!busy) return null;
  if (phase === "grilling") return "正在识别研究意图…";
  if (phase === "outline_pending" || phase === "supplement_pending") {
    return "正在整理搜索纲要…";
  }
  if (phase === "looping") {
    if (step === "exploring") return "正在深入阅读子页面…";
    if (step === "extracting") return "正在抽取网页正文…";
    if (step === "filtering") return "正在筛选材料…";
    if (step === "searching") return "正在搜索…";
    if (step === "summarizing") return "正在写本轮总结…";
    return "正在搜索、筛选或抽取正文…";
  }
  if (phase === "reporting") {
    if (pending === "codexReportPlan" || pending === "codexReport") {
      return "正在写撰写计划…";
    }
    if (reportWrite?.turn && reportWrite.maxTurns) {
      return `正在写报告（第 ${reportWrite.turn}/${reportWrite.maxTurns} 轮）…`;
    }
    return "正在迭代写报告…";
  }
  return "处理中…";
}
