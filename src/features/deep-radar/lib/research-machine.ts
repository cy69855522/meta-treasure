import { DEFAULT_MAX_ROUNDS, EXPLORE_MAX_BATCHES, MAX_GRILL_QUESTIONS, SKIP_OUTLINE_RE } from "@/features/deep-radar/lib/constants";
import { normalizeQueryPair } from "@/features/deep-radar/lib/query-lang";
import { allowedExploreUrls } from "@/features/deep-radar/lib/research-explore";
import { normalizeOutline } from "@/features/deep-radar/lib/research-outline";
import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";
import {
  createInitialState,
  currentLoopRoundCount,
  reportPreview,
  type Command,
  type MessageImage,
  type NewMessage,
  type ReduceContext,
  type ReduceResult,
  type ReportPlan,
  type ResearchEvent,
  type ResearchLink,
  type ResearchState,
} from "@/features/deep-radar/lib/research-types";
import type { SearchSource } from "@/features/deep-radar/lib/settings-types";

function wantsSkipGrill(text: string): boolean {
  return SKIP_OUTLINE_RE.test(text.trim());
}

function withCommands(
  state: ResearchState,
  commands: Command[],
  patch: Partial<ResearchState> = {},
): ResearchState {
  return {
    ...state,
    ...patch,
    pendingCommands: commands,
    error: patch.error === undefined ? null : patch.error,
  };
}

function staleLoopEvent(state: ResearchState): boolean {
  return state.phase !== "looping" || !state.draftRound;
}

function startReporting(state: ResearchState): ReduceResult {
  return {
    state: withCommands(state, [{ type: "codexReportPlan" }], {
      phase: "reporting",
      stopRequested: false,
      report: null,
      reportPlan: null,
    }),
    messages: [],
  };
}

function pause(state: ResearchState, messages: NewMessage[]): ReduceResult {
  return {
    state: withCommands(state, [], {
      phase: "paused",
      draftRound: null,
      stopRequested: true,
    }),
    messages,
  };
}

export function reduce(
  state: ResearchState,
  event: ResearchEvent,
  ctx: ReduceContext,
): ReduceResult {
  switch (event.type) {
    case "USER_MESSAGE":
      return onUserMessage(state, event.text, ctx, event.images, event.skipGrill);
    case "GRILL_RESULT":
      return onGrillResult(state, event);
    case "OUTLINE_DRAFTED":
      return onOutlineDrafted(state, event.outline);
    case "APPROVE_OUTLINE":
      return onApproveOutline(state, ctx);
    case "REVISE_OUTLINE":
      return onReviseOutline(state, event.feedback);
    case "QUERY_GENERATED":
      return onQueryGenerated(state, event);
    case "SEARCH_DONE":
      return onSearchDone(state, event);
    case "FILTER_DONE":
      return onFilterDone(state, event);
    case "EXTRACT_DONE":
      return onExtractDone(state, event);
    case "EXPLORE_DECIDED":
      return onExploreDecided(state, event, ctx);
    case "ROUND_FINDINGS":
      return onRoundFindings(state, event);
    case "REPORT_PLAN_DRAFTED":
      return onReportPlanDrafted(state, event.plan);
    case "REPORT_DONE":
      return onReportDone(state, event.report);
    case "FOLLOWUP_ANSWER":
      return onFollowupAnswer(state, event.text);
    case "FOLLOWUP_NEED_SEARCH":
      return onFollowupNeedSearch(state, event.outline);
    case "STOP":
      return onStop(state);
    case "CONTINUE":
      return onContinue(state);
    case "GENERATE_REPORT":
      return onGenerateReport(state);
    case "NODE_FAILED":
      return onNodeFailed(state, event.error);
    default:
      return { state, messages: [] };
  }
}

function onUserMessage(
  state: ResearchState,
  text: string,
  _ctx: ReduceContext,
  images?: MessageImage[],
  skipGrill?: boolean,
): ReduceResult {
  const trimmed = text.trim();
  const attached = images?.length ? images : undefined;
  if (!trimmed && !attached?.length) return { state, messages: [], error: "empty" };

  if (state.phase === "looping" || state.phase === "reporting") {
    return { state, messages: [], error: "loop_busy" };
  }

  const userMsg: NewMessage = {
    role: "user",
    kind: "text",
    content: trimmed,
    images: attached,
  };

  if (state.phase === "idle" || state.phase === "grilling") {
    if (skipGrill || wantsSkipGrill(trimmed) || state.grillCount >= MAX_GRILL_QUESTIONS) {
      return {
        state: withCommands(state, [{ type: "codexOutline" }], {
          phase: "grilling",
          stopRequested: false,
        }),
        messages: [userMsg],
      };
    }
    return {
      state: withCommands(state, [{ type: "codexGrill" }], {
        phase: "grilling",
        stopRequested: false,
      }),
      messages: [userMsg],
    };
  }

  if (state.phase === "outline_pending" || state.phase === "supplement_pending") {
    return {
      state: withCommands(state, [{ type: "codexOutline", feedback: trimmed }], {
        stopRequested: false,
      }),
      messages: [userMsg],
    };
  }

  if (state.phase === "paused" || state.phase === "ready") {
    return {
      state: withCommands(state, [{ type: "codexFollowup", text: trimmed }], {
        stopRequested: false,
      }),
      messages: [userMsg],
    };
  }

  return { state, messages: [userMsg] };
}

function onGrillResult(
  state: ResearchState,
  event: { done: boolean; question?: string },
): ReduceResult {
  if (state.phase !== "grilling" || state.stopRequested) return { state, messages: [] };

  const question = event.question?.trim();
  if (event.done || state.grillCount >= MAX_GRILL_QUESTIONS || !question) {
    return {
      state: withCommands(state, [{ type: "codexOutline" }]),
      messages: [],
    };
  }

  return {
    state: withCommands(state, [], {
      grillCount: state.grillCount + 1,
    }),
    messages: [
      {
        role: "assistant",
        kind: "text",
        content: question,
      },
    ],
  };
}

function onOutlineDrafted(
  state: ResearchState,
  outline: ResearchState["pendingOutline"],
): ReduceResult {
  if (!outline || state.stopRequested) return { state, messages: [] };
  const waiting =
    state.phase === "grilling" ||
    state.phase === "outline_pending" ||
    state.phase === "supplement_pending" ||
    state.phase === "ready";
  if (!waiting) return { state, messages: [] };

  const normalized = normalizeOutline(outline);
  const phase =
    state.phase === "ready" || state.phase === "supplement_pending"
      ? "supplement_pending"
      : "outline_pending";

  return {
    state: withCommands(state, [], {
      phase,
      pendingOutline: normalized,
    }),
    messages: [
      {
        role: "assistant",
        kind: "outline",
        content: normalized.goal,
        payload: normalized,
      },
    ],
  };
}

function onApproveOutline(
  state: ResearchState,
  ctx: ReduceContext,
): ReduceResult {
  if (
    state.phase !== "outline_pending" &&
    state.phase !== "supplement_pending"
  ) {
    return { state, messages: [], error: "not_pending" };
  }
  if (!state.pendingOutline) {
    return { state, messages: [], error: "missing_outline" };
  }

  const isSupplement = state.phase === "supplement_pending";
  return {
    state: withCommands(state, [{ type: "codexQuery" }], {
      phase: "looping",
      outline: state.pendingOutline,
      pendingOutline: null,
      snapshot: { ...ctx.settings },
      loopStartIndex: isSupplement ? state.rounds.length : 0,
      draftRound: null,
      stopRequested: false,
      report: isSupplement ? state.report : null,
    }),
    messages: [],
  };
}

function onReviseOutline(state: ResearchState, feedback: string): ReduceResult {
  if (
    state.phase !== "outline_pending" &&
    state.phase !== "supplement_pending"
  ) {
    return { state, messages: [], error: "not_pending" };
  }
  const text = feedback.trim();
  if (!text) return { state, messages: [], error: "empty" };
  return {
    state: withCommands(state, [{ type: "codexOutline", feedback: text }]),
    messages: [],
  };
}

function onQueryGenerated(
  state: ResearchState,
  event: Extract<ResearchEvent, { type: "QUERY_GENERATED" }>,
): ReduceResult {
  if (state.phase !== "looping") return { state, messages: [] };
  if (state.stopRequested) return pause(state, []);
  const pair = normalizeQueryPair(event);
  if (!pair) {
    return {
      state: withCommands(state, [{ type: "codexQuery" }]),
      messages: [],
    };
  }
  return {
    state: withCommands(
      state,
      [
        {
          type: "search",
          query: pair.query,
          queryZh: pair.queryZh,
          queryEn: pair.queryEn,
        },
      ],
      {
        draftRound: {
          query: pair.query,
          queryZh: pair.queryZh,
          queryEn: pair.queryEn,
          targetQuestion: event.targetQuestion?.trim() || pair.query,
          step: "searching",
          hits: [],
        },
      },
    ),
    messages: [],
  };
}

function onSearchDone(
  state: ResearchState,
  event: Extract<ResearchEvent, { type: "SEARCH_DONE" }>,
): ReduceResult {
  if (staleLoopEvent(state) || !state.draftRound) return { state, messages: [] };
  if (state.stopRequested) return pause(state, []);
  return {
    state: withCommands(state, [{ type: "codexFilter" }], {
      draftRound: {
        ...state.draftRound,
        step: "filtering",
        hits: event.hits,
        errors: event.errors,
      },
    }),
    messages: [],
  };
}

function onFilterDone(
  state: ResearchState,
  event: Extract<ResearchEvent, { type: "FILTER_DONE" }>,
): ReduceResult {
  if (staleLoopEvent(state) || !state.draftRound) return { state, messages: [] };
  if (state.stopRequested) return pause(state, []);

  const known = new Set(
    state.draftRound.hits.map((h) => h.normalizedUrl || h.url),
  );
  const cited = event.cited.filter((c) => known.has(c.url) || [...known].some((u) => u === c.url) || state.draftRound!.hits.some((h) => h.url === c.url));
  const unused = event.unused;

  const extractUrls = cited
    .map((c) => {
      const hit = state.draftRound!.hits.find(
        (h) => h.url === c.url || h.normalizedUrl === c.url,
      );
      return hit?.url;
    })
    .filter((u): u is string => Boolean(u));

  return {
    state: withCommands(
      state,
      extractUrls.length > 0
        ? [{ type: "extract", urls: extractUrls }]
        : [{ type: "codexFindings" }],
      {
        draftRound: {
          ...state.draftRound,
          step: extractUrls.length > 0 ? "extracting" : "summarizing",
          cited,
          unused,
        },
      },
    ),
    messages: [],
  };
}

function onExtractDone(
  state: ResearchState,
  event: Extract<ResearchEvent, { type: "EXTRACT_DONE" }>,
): ReduceResult {
  if (staleLoopEvent(state) || !state.draftRound) return { state, messages: [] };
  if (state.stopRequested) return pause(state, []);

  const extracts = event.extracts;
  const pages = event.pages ?? {};
  const hits: ResearchLink[] = state.draftRound.hits.map((hit) => {
    const page = pages[hit.url] ?? pages[hit.normalizedUrl];
    const body = extracts[hit.url] ?? extracts[hit.normalizedUrl];
    if (!body && !page) return hit;
    return {
      ...hit,
      title: page?.title?.trim() || hit.title,
      extracted: body || hit.extracted,
      childLinks: page?.links ?? hit.childLinks,
    };
  });

  const exploreCount = state.draftRound.exploreCount ?? 0;
  const canExplore = exploreCount < EXPLORE_MAX_BATCHES;
  return {
    state: withCommands(
      state,
      canExplore ? [{ type: "codexExplore" }] : [{ type: "codexFindings" }],
      {
        draftRound: {
          ...state.draftRound,
          step: canExplore ? "exploring" : "summarizing",
          hits,
        },
      },
    ),
    messages: [],
  };
}

function onExploreDecided(
  state: ResearchState,
  event: Extract<ResearchEvent, { type: "EXPLORE_DECIDED" }>,
  ctx: ReduceContext,
): ReduceResult {
  if (staleLoopEvent(state) || !state.draftRound) return { state, messages: [] };
  if (state.stopRequested) return pause(state, []);

  const draft = state.draftRound;
  if ((draft.exploreCount ?? 0) >= EXPLORE_MAX_BATCHES) {
    return {
      state: withCommands(state, [{ type: "codexFindings" }], {
        draftRound: { ...draft, step: "summarizing" },
      }),
      messages: [],
    };
  }
  const urls = allowedExploreUrls(draft, event.urls);
  if (urls.length === 0) {
    return {
      state: withCommands(state, [{ type: "codexFindings" }], {
        draftRound: { ...draft, step: "summarizing" },
      }),
      messages: [],
    };
  }

  const sources = ctx.settings.sources;
  const extraHits = urls.map((url) =>
    exploreHit(url, draft, event.reason, sources),
  );
  const extraCited = urls.map((url) => ({
    url,
    reason: event.reason?.trim() || "深入阅读子页面",
  }));
  return {
    state: withCommands(state, [{ type: "extract", urls }], {
      draftRound: {
        ...draft,
        step: "extracting",
        hits: [...draft.hits, ...extraHits],
        cited: [...(draft.cited ?? []), ...extraCited],
        exploredUrls: [...(draft.exploredUrls ?? []), ...urls],
        exploreCount: (draft.exploreCount ?? 0) + 1,
      },
    }),
    messages: [],
  };
}

function exploreHit(
  url: string,
  draft: ResearchState["draftRound"] & object,
  reason: string | undefined,
  sources: SearchSource[],
): ResearchLink {
  const parent = draft.hits.find((hit) =>
    hit.childLinks?.some(
      (child) => (normalizeUrl(child.url) || child.url) === (normalizeUrl(url) || url),
    ),
  );
  const title =
    parent?.childLinks?.find(
      (child) => (normalizeUrl(child.url) || child.url) === (normalizeUrl(url) || url),
    )?.title || urlTitle(url);
  return {
    url,
    normalizedUrl: normalizeUrl(url) || url,
    title,
    source: inferExploreSource(url, draft, sources),
    snippet: reason || "深入阅读子页面",
    cited: true,
    relevant: true,
    reason: reason || "深入阅读子页面",
    parentUrl: parent?.url,
    roundIndex: -1,
  };
}

function inferExploreSource(
  url: string,
  draft: NonNullable<ResearchState["draftRound"]>,
  sources: SearchSource[],
): SearchSource {
  try {
    const host = new URL(url).hostname;
    if (host.includes("zhihu")) return "zhihu";
    if (host.includes("weixin") || host.includes("wechat")) return "wechat";
  } catch {
    // keep going
  }
  const key = normalizeUrl(url) || url;
  const parent = draft.hits.find((hit) =>
    hit.childLinks?.some(
      (child) => (normalizeUrl(child.url) || child.url) === key,
    ),
  );
  if (parent) return parent.source;
  return sources[0] ?? "baidu";
}

function urlTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || parsed.hostname);
  } catch {
    return url;
  }
}

function onRoundFindings(
  state: ResearchState,
  event: Extract<ResearchEvent, { type: "ROUND_FINDINGS" }>,
): ReduceResult {
  if (staleLoopEvent(state) || !state.draftRound) return { state, messages: [] };
  if (state.stopRequested) return pause(state, []);

  const draft = state.draftRound;
  const roundIndex = state.rounds.length;
  const citedUrls = (draft.cited ?? []).map((c) => c.url);
  const unusedUrls = (draft.unused ?? []).map((u) => u.url);

  const newLinks: ResearchLink[] = draft.hits.map((hit) => {
    const pick = draft.cited?.find(
      (c) => c.url === hit.url || c.url === hit.normalizedUrl,
    );
    const leftover = draft.unused?.find(
      (u) => u.url === hit.url || u.url === hit.normalizedUrl,
    );
    return {
      ...hit,
      cited: Boolean(pick),
      relevant: pick ? true : leftover?.relevant,
      reason: pick?.reason ?? leftover?.reason,
      roundIndex,
    };
  });

  const existing = new Set(state.links.map((l) => l.normalizedUrl));
  const mergedLinks = [
    ...state.links,
    ...newLinks.filter((l) => !existing.has(l.normalizedUrl)),
  ].map((l) => {
    const pick = draft.cited?.find(
      (c) => c.url === l.url || c.url === l.normalizedUrl,
    );
    if (!pick) return l;
    const fresh = newLinks.find((n) => n.normalizedUrl === l.normalizedUrl);
    return {
      ...l,
      cited: true,
      relevant: true,
      reason: pick.reason,
      extracted: fresh?.extracted ?? l.extracted,
    };
  });

  const summary = (event.summary ?? event.findings).trim();
  const analysis = (event.analysis ?? event.gaps).trim();
  const round = {
    index: roundIndex,
    query: draft.query,
    queryZh: draft.queryZh,
    queryEn: draft.queryEn,
    targetQuestion: draft.targetQuestion,
    findings: summary,
    gaps: analysis,
    summary,
    analysis,
    keywords: event.keywords,
    citedUrls,
    unusedUrls,
    errors: draft.errors,
  };

  const nextState: ResearchState = {
    ...state,
    rounds: [...state.rounds, round],
    links: mergedLinks,
    draftRound: null,
    stopRequested: false,
  };

  const roundMessage: NewMessage = {
    role: "assistant",
    kind: "round",
    content: summary,
    payload: {
      round,
      cited: newLinks.filter((l) => l.cited),
      unused: newLinks.filter((l) => !l.cited),
    },
  };

  const loopCount = currentLoopRoundCount(nextState);
  const maxRounds = state.snapshot?.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const hitCap = loopCount >= maxRounds;

  if (event.shouldStop || hitCap) {
    return {
      state: withCommands(nextState, [{ type: "codexReportPlan" }], {
        phase: "reporting",
        report: null,
        reportPlan: null,
      }),
      messages: [roundMessage],
    };
  }

  return {
    state: withCommands(nextState, [{ type: "codexQuery" }], {
      phase: "looping",
    }),
    messages: [roundMessage],
  };
}

function onReportPlanDrafted(
  state: ResearchState,
  plan: ReportPlan,
): ReduceResult {
  if (state.phase !== "reporting" && state.phase !== "paused") {
    return { state, messages: [] };
  }
  const planMessage: NewMessage = {
    role: "assistant",
    kind: "report_plan",
    content: plan.title,
    payload: plan,
  };
  if (state.phase === "paused" || state.stopRequested) {
    return {
      state: withCommands(state, [], {
        phase: "paused",
        reportPlan: plan,
        stopRequested: true,
      }),
      messages: [planMessage],
    };
  }
  return {
    state: withCommands(state, [{ type: "codexReportWrite" }], {
      phase: "reporting",
      reportPlan: plan,
    }),
    messages: [planMessage],
  };
}

function onReportDone(
  state: ResearchState,
  report: ResearchState["report"],
): ReduceResult {
  if (state.phase !== "reporting" && state.phase !== "paused") {
    return { state, messages: [] };
  }
  if (state.stopRequested || !report) return { state, messages: [] };
  return {
    state: withCommands(state, [], {
      phase: "ready",
      report,
      draftRound: null,
      reportWrite: null,
      stopRequested: false,
    }),
    messages: [
      {
        role: "assistant",
        kind: "report",
        content: reportPreview(report),
        payload: report,
      },
    ],
  };
}

function onFollowupAnswer(state: ResearchState, text: string): ReduceResult {
  if (state.stopRequested) return { state, messages: [] };
  if (state.phase !== "ready" && state.phase !== "paused") {
    return { state, messages: [] };
  }
  return {
    state: withCommands(state, []),
    messages: [{ role: "assistant", kind: "text", content: text }],
  };
}

function onFollowupNeedSearch(
  state: ResearchState,
  outline: ResearchState["pendingOutline"],
): ReduceResult {
  if (state.stopRequested) return { state, messages: [] };
  if (state.phase !== "ready" && state.phase !== "paused") {
    return { state, messages: [] };
  }
  if (!outline) return { state, messages: [] };
  const normalized = normalizeOutline(outline);
  return {
    state: withCommands(state, [], {
      phase: "supplement_pending",
      pendingOutline: normalized,
    }),
    messages: [
      {
        role: "assistant",
        kind: "outline",
        content: normalized.goal,
        payload: normalized,
      },
    ],
  };
}

function onStop(state: ResearchState): ReduceResult {
  if (
    state.phase !== "looping" &&
    state.phase !== "reporting" &&
    state.pendingCommands.length === 0
  ) {
    return { state, messages: [] };
  }
  if (state.phase !== "looping" && state.phase !== "reporting") {
    return {
      state: withCommands(state, [], { stopRequested: true }),
      messages: [],
    };
  }
  if (state.phase === "reporting") {
    return {
      state: withCommands(state, [], {
        phase: "paused",
        stopRequested: true,
        draftRound: null,
      }),
      messages: [],
    };
  }
  return pause(state, []);
}

function onContinue(state: ResearchState): ReduceResult {
  if (state.phase !== "paused") {
    return { state, messages: [], error: "not_paused" };
  }
  // Resume unfinished report writing instead of starting another research round.
  if (state.reportPlan && !state.report) {
    return {
      state: withCommands(state, [{ type: "codexReportWrite" }], {
        phase: "reporting",
        stopRequested: false,
        error: null,
        reportWrite: null,
      }),
      messages: [],
    };
  }
  const maxRounds = state.snapshot?.maxRounds ?? DEFAULT_MAX_ROUNDS;
  if (currentLoopRoundCount(state) >= maxRounds) {
    return startReporting({ ...state, stopRequested: false });
  }
  return {
    state: withCommands(state, [{ type: "codexQuery" }], {
      phase: "looping",
      stopRequested: false,
      draftRound: null,
      error: null,
    }),
    messages: [],
  };
}

function onGenerateReport(state: ResearchState): ReduceResult {
  if (state.phase !== "paused" && state.phase !== "ready") {
    return { state, messages: [], error: "not_paused" };
  }
  if (state.reportPlan && !state.report) {
    return {
      state: withCommands(state, [{ type: "codexReportWrite" }], {
        phase: "reporting",
        stopRequested: false,
        error: null,
        reportWrite: null,
      }),
      messages: [],
    };
  }
  return startReporting(state);
}

function onNodeFailed(state: ResearchState, error: string): ReduceResult {
  if (state.phase === "looping" || state.phase === "reporting") {
    return {
      state: withCommands(state, [], {
        phase: "paused",
        draftRound: null,
        reportWrite: null,
        stopRequested: true,
        error,
      }),
      messages: [
        {
          role: "assistant",
          kind: "status",
          content:
            state.phase === "reporting"
              ? `撰写报告出错，已冻结：${error}`
              : `本轮循环出错，已冻结：${error}`,
        },
      ],
    };
  }
  return {
    state: withCommands(state, [], { error }),
    messages: [
      {
        role: "assistant",
        kind: "status",
        content: `出错了：${error}`,
      },
    ],
  };
}

export { createInitialState };
