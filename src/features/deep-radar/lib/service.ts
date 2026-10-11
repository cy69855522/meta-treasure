import "server-only";

import { DEFAULT_MAX_ROUNDS } from "@/features/deep-radar/lib/constants";
import {
  createSession,
  getSession,
  isFavorited,
  isProgressAuto,
  listFavoriteSessions,
  listMessages,
  listSessions,
  setFavorited,
  setProgressAuto,
} from "@/features/deep-radar/lib/db";
import {
  applyEvent,
  drain,
  isBusy,
  requestAbort,
} from "@/features/deep-radar/lib/research-orchestrator";
import { researchStore, wireRuntime } from "@/features/deep-radar/lib/runtime";
import type { Phase, Report } from "@/features/deep-radar/lib/research-types";

const REPORT_TEXT_LIMIT = 16_000;

export function sessionPageUrl(sessionId: string, report = false): string {
  const base = `/deep-radar/research/${sessionId}`;
  return report ? `${base}#report` : base;
}

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "grilling":
      return "整理纲要";
    case "outline_pending":
    case "supplement_pending":
      return "待确认纲要";
    case "looping":
      return "搜索研究中";
    case "paused":
      return "已暂停";
    case "reporting":
      return "撰写报告";
    case "ready":
      return "已完成";
    default:
      return "未开始";
  }
}

function reportReady(report: Report | null | undefined): boolean {
  if (!report) return false;
  if (report.markdown?.trim()) return true;
  if (report.judgment?.trim() || report.actionPath?.trim()) return true;
  return Boolean(report.conclusions?.length);
}

export function sessionSnapshot(sessionId: string) {
  wireRuntime();
  const session = getSession(sessionId);
  if (!session) return null;
  const state = session.state;
  const hasReport = reportReady(state.report);
  const messages = listMessages(sessionId);
  const last = [...messages].reverse().find((message) => message.content.trim());
  return {
    sessionId: session.id,
    title: session.title,
    phase: state.phase,
    phaseLabel: phaseLabel(state.phase),
    busy: isBusy(sessionId) || state.pendingCommands.length > 0,
    error: state.error,
    outline: state.outline?.goal || state.pendingOutline?.goal || null,
    rounds: state.rounds.length,
    hasReport,
    reportChars: state.report?.markdown?.trim().length ?? 0,
    progressAuto: isProgressAuto(sessionId),
    favorited: isFavorited(sessionId),
    favoritedAt: session.favoritedAt ?? null,
    lastMessage: last
      ? {
          role: last.role,
          kind: last.kind,
          text: last.content.slice(0, 400),
        }
      : null,
    url: sessionPageUrl(session.id, false),
    reportUrl: sessionPageUrl(session.id, true),
  };
}

/** Compact progress for the Progress chat bar and deepRadarProgress tool. */
export function progressSnapshot(sessionId: string) {
  const snap = sessionSnapshot(sessionId);
  if (!snap) return null;
  const state = getSession(sessionId)?.state;
  const reportWrite = state?.reportWrite ?? null;
  const maxRounds = state?.snapshot?.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const reporting = snap.phase === "reporting" || Boolean(reportWrite);
  let terminal: "running" | "done" | "failed" = "running";
  if (reporting) terminal = "running";
  else if (snap.phase === "ready") terminal = "done";
  else if ((snap.error || snap.phase === "paused") && !snap.busy) terminal = "failed";

  let percent: number | null = null;
  let label = snap.phaseLabel;
  if (reporting && reportWrite && reportWrite.maxTurns > 0) {
    percent = Math.min(
      100,
      Math.round((reportWrite.turn / reportWrite.maxTurns) * 100),
    );
    label = `撰写报告 ${reportWrite.turn}/${reportWrite.maxTurns}`;
  } else if (snap.phase === "looping") {
    percent = Math.min(99, Math.round((snap.rounds / Math.max(1, maxRounds)) * 100));
    label = `搜索研究 ${snap.rounds}/${maxRounds}`;
  } else if (terminal === "done") {
    percent = 100;
    label = "研究完成";
  } else if (terminal === "failed") {
    label = snap.error
      ? `研究失败：${snap.error}`
      : snap.phase === "paused"
        ? "研究已暂停"
        : "研究失败";
  }

  return {
    sessionId: snap.sessionId,
    title: snap.title,
    phase: snap.phase,
    phaseLabel: snap.phaseLabel,
    label,
    busy: snap.busy,
    error: snap.error,
    rounds: snap.rounds,
    maxRounds,
    reportWrite,
    hasReport: snap.hasReport,
    percent,
    terminal,
    url: snap.url,
    reportUrl: snap.reportUrl,
  };
}

export function listSessionSnapshots(limit: number) {
  wireRuntime();
  return listSessions()
    .slice(0, limit)
    .map((summary) => {
      const session = getSession(summary.id);
      const hasReport = reportReady(session?.state.report);
      return {
        sessionId: summary.id,
        title: summary.title,
        phase: summary.phase,
        phaseLabel: phaseLabel(summary.phase),
        updatedAt: summary.updatedAt,
        createdAt: summary.createdAt,
        hasReport,
        busy: isBusy(summary.id) || Boolean(session?.state.pendingCommands.length),
        url: sessionPageUrl(summary.id, false),
        reportUrl: sessionPageUrl(summary.id, true),
      };
    });
}

export function reportSnapshot(sessionId: string) {
  const snap = sessionSnapshot(sessionId);
  if (!snap) return null;
  const report = getSession(sessionId)?.state.report;
  const markdown = report?.markdown?.trim() || "";
  const clipped = markdown.length > REPORT_TEXT_LIMIT;
  return {
    ...snap,
    ready: snap.hasReport,
    markdown: clipped ? `${markdown.slice(0, REPORT_TEXT_LIMIT)}…` : markdown,
    clipped,
    conclusions: (report?.conclusions || []).map((item) => ({
      headline: item.headline,
      notes: item.notes,
    })),
    judgment: report?.judgment || "",
    actionPath: report?.actionPath || "",
    keywords: report?.keywords || [],
  };
}

function reportSnippet(sessionId: string): string {
  const report = getSession(sessionId)?.state.report;
  if (!report) return "";
  const markdown = report.markdown?.trim() || "";
  if (markdown) {
    const plain = markdown
      .replace(/^#+\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_>~|-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plain.slice(0, 180);
  }
  if (report.judgment?.trim()) return report.judgment.trim().slice(0, 180);
  if (report.conclusions?.length) {
    return report.conclusions
      .map((item) => item.headline)
      .filter(Boolean)
      .join("；")
      .slice(0, 180);
  }
  return "";
}

export function listFavoriteSnapshots(limit = 100) {
  wireRuntime();
  return listFavoriteSessions()
    .slice(0, limit)
    .map((summary) => {
      const session = getSession(summary.id);
      const snippet = reportSnippet(summary.id);
      return {
        sessionId: summary.id,
        title: summary.title,
        phase: summary.phase,
        phaseLabel: phaseLabel(summary.phase),
        updatedAt: summary.updatedAt,
        createdAt: summary.createdAt,
        favoritedAt: summary.favoritedAt ?? null,
        hasReport: true,
        snippet,
        keywords: session?.state.report?.keywords ?? [],
        url: sessionPageUrl(summary.id, false),
        reportUrl: sessionPageUrl(summary.id, true),
      };
    });
}

export function toggleFavorite(sessionId: string, favorited?: boolean) {
  wireRuntime();
  const session = getSession(sessionId);
  if (!session) throw new Error("研究会话不存在");
  if (!reportReady(session.state.report)) {
    throw new Error("只有已完成的研究报告才能收藏");
  }
  const next =
    typeof favorited === "boolean" ? favorited : !isFavorited(sessionId);
  setFavorited(sessionId, next);
  return sessionSnapshot(sessionId);
}

/** Catalog only: favorite report id + title + snippet (no body). */
export function buildFavoriteReportsCatalogBlock(): string {
  wireRuntime();
  const favorites = listFavoriteSnapshots(100);
  if (favorites.length === 0) return "（收藏夹为空）";
  return favorites
    .map((item, index) => {
      const desc = item.snippet || item.title || "（无摘要）";
      return `${index + 1}. ${item.title} (id=${item.sessionId}): ${desc}`;
    })
    .join("\n");
}

export const FAVORITE_REPORT_LOAD_PROMPT_LINES = [
  "收藏的研究报告：下方目录只有 id / title / 摘要，不含正文。",
  "当用户问题与某条收藏报告相关时，先调用 deepRadarReport（传入 sessionId=该 id）加载报告正文再回答；不相关则不必加载。",
  "也可用 deepRadarFavoriteList 刷新收藏列表。对用户说话时用报告标题，不要写出 id。",
] as const;

/** Create a session and start Deep Research without waiting for the full loop. */
export function startResearchFromProgress(brief: string, title?: string) {
  wireRuntime();
  const text = brief.trim();
  if (!text) throw new Error("需求文本不能为空");
  const session = createSession(title?.trim() || text.slice(0, 40));
  setProgressAuto(session.id, true);
  const store = researchStore();
  applyEvent(store, session.id, {
    type: "USER_MESSAGE",
    text,
    skipGrill: true,
  });
  void runProgressResearch(session.id).catch((error) => {
    console.error("progress research kickoff failed", session.id, error);
  });
  return sessionSnapshot(session.id);
}

export function postProgressAction(
  sessionId: string,
  action: string,
  text?: string,
) {
  wireRuntime();
  if (!getSession(sessionId)) throw new Error("研究会话不存在");
  const store = researchStore();
  if (action === "message") {
    const body = text?.trim() || "";
    if (!body) throw new Error("消息不能为空");
    applyEvent(store, sessionId, { type: "USER_MESSAGE", text: body });
    void drain(store, sessionId);
  } else if (action === "approve") {
    applyEvent(store, sessionId, { type: "APPROVE_OUTLINE" });
    void drain(store, sessionId);
  } else if (action === "continue") {
    applyEvent(store, sessionId, { type: "CONTINUE" });
    void drain(store, sessionId);
  } else if (action === "report") {
    applyEvent(store, sessionId, { type: "GENERATE_REPORT" });
    void drain(store, sessionId);
  } else if (action === "stop") {
    requestAbort(sessionId);
    applyEvent(store, sessionId, { type: "STOP" });
  } else {
    throw new Error("未知操作");
  }
  return sessionSnapshot(sessionId);
}

async function runProgressResearch(sessionId: string) {
  const store = researchStore();
  await drain(store, sessionId);
  if (!isProgressAuto(sessionId)) return;
  const session = getSession(sessionId);
  if (!session) return;
  if (
    session.state.phase !== "outline_pending" &&
    session.state.phase !== "supplement_pending"
  ) {
    return;
  }
  if (!session.state.pendingOutline) return;
  applyEvent(store, sessionId, { type: "APPROVE_OUTLINE" });
  await drain(store, sessionId);
}
