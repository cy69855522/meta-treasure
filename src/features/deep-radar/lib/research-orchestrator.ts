import { DeepResearchAgent, type PageExtract } from "@progress/deep-research";
import { DEFAULT_MAX_ROUNDS, EXPLORE_CHILD_LINK_LIMIT } from "@/features/deep-radar/lib/constants";
import { applyHitReviews } from "@/features/deep-radar/lib/research-filter";
import { hitsToLinks, mergeUniqueLinks } from "@/features/deep-radar/lib/merge-links";
import { reduce } from "@/features/deep-radar/lib/research-machine";
import {
  exploreNode,
  filterNode,
  findingsNode,
  followupNode,
  grillNode,
  outlineNode,
  queryNode,
  reportPlanNode,
  reportWriteNode,
  type LlmPort,
} from "@/features/deep-radar/lib/research-nodes";
import { collectSessionImages } from "@/features/deep-radar/lib/research-images";
import { resumeReplay } from "@/features/deep-radar/lib/research-rewind";
import type {
  ChatMessage,
  NewMessage,
  ReduceContext,
  ResearchEvent,
  ResearchLink,
  ResearchSession,
  ResearchState,
} from "@/features/deep-radar/lib/research-types";
import { normalizeSources, type AppSettings, type SearchSource } from "@/features/deep-radar/lib/settings-types";
import { normalizeUrl } from "@/features/deep-radar/lib/url-normalize";

export type SessionStore = {
  get(id: string): ResearchSession | null;
  save(id: string, state: ResearchState, title?: string): void;
  append(
    id: string,
    messages: NewMessage[],
    state?: ResearchState,
  ): ChatMessage[];
  list(id: string): ChatMessage[];
  rewind(id: string, messageId: string, keepMessage: boolean, resume?: boolean): void;
};

export type SearchPort = {
  search: (
    query: string,
    sources: SearchSource[],
    pair?: { queryZh?: string; queryEn?: string },
  ) => Promise<{
    hits: ResearchLink[];
    errors?: Partial<Record<SearchSource, string>>;
  }>;
  extract: (url: string, source: SearchSource) => Promise<string>;
  extractPage?: (
    url: string,
    source: SearchSource,
  ) => Promise<PageExtract>;
};

export type OrchestratorDeps = {
  llm: LlmPort;
  search: SearchPort;
  settings: () => AppSettings;
};

const running = new Map<string, Promise<void>>();
const aborting = new Set<string>();
const inflightAbort = new Map<string, AbortController>();

export function requestAbort(sessionId: string) {
  aborting.add(sessionId);
  inflightAbort.get(sessionId)?.abort();
}

export function isBusy(sessionId: string) {
  return running.has(sessionId);
}

export async function applyAndDrain(
  store: SessionStore,
  sessionId: string,
  event: ResearchEvent,
): Promise<ResearchSession> {
  const session = applyEvent(store, sessionId, event);
  await drain(store, sessionId);
  return store.get(sessionId) ?? session;
}

function reduceCtx(): ReduceContext {
  if (!depsRef) {
    return { settings: { maxRounds: DEFAULT_MAX_ROUNDS, sources: ["zhihu", "wechat"] } };
  }
  return { settings: loopSnapshot(depsRef.settings()) };
}

export function applyEvent(
  store: SessionStore,
  sessionId: string,
  event: ResearchEvent,
): ResearchSession {
  const session = store.get(sessionId);
  if (!session) throw new Error("研究会话不存在");
  const ctx = reduceCtx();
  const result = reduce(session.state, event, ctx);
  store.save(sessionId, result.state);
  if (result.messages.length) {
    store.append(sessionId, result.messages, result.state);
  }
  return { ...session, state: result.state };
}

let depsRef: OrchestratorDeps;

export function configureOrchestrator(deps: OrchestratorDeps) {
  depsRef = deps;
}

function loopSnapshot(settings: AppSettings) {
  return { maxRounds: settings.maxRounds, sources: [...settings.sources] };
}

export function drain(store: SessionStore, sessionId: string): Promise<void> {
  const existing = running.get(sessionId);
  if (existing) return existing;
  const job = (async () => {
    try {
      await drainOnce(store, sessionId);
    } finally {
      running.delete(sessionId);
    }
  })();
  running.set(sessionId, job);
  return job;
}

export async function rewindAndResume(
  store: SessionStore,
  sessionId: string,
  messageId: string,
  options: boolean | { keepMessage: boolean; resume?: boolean },
) {
  const keepMessage = typeof options === "boolean" ? options : options.keepMessage;
  const resume = typeof options === "boolean" ? options : (options.resume ?? keepMessage);
  if (running.has(sessionId)) {
    requestAbort(sessionId);
    await running.get(sessionId)?.catch(() => undefined);
  }
  aborting.delete(sessionId);
  const target = store.list(sessionId).find((message) => message.id === messageId);
  if (!target) throw new Error("消息不存在");
  store.rewind(sessionId, messageId, keepMessage, resume);
  if (!resume) return;
  const session = store.get(sessionId);
  if (session && target.role === "assistant") {
    let next = resumeReplay(session.state, target, store.list(sessionId));
    if (next.pendingCommands[0]?.type === "codexQuery" && !next.snapshot && depsRef) {
      next = {
        ...next,
        snapshot: loopSnapshot(depsRef.settings()),
      };
    }
    store.save(sessionId, next);
  }
  await drain(store, sessionId);
}

async function drainOnce(store: SessionStore, sessionId: string) {
  const controller = new AbortController();
  inflightAbort.set(sessionId, controller);
  try {
    for (;;) {
      if (aborting.has(sessionId) || controller.signal.aborted) {
        aborting.delete(sessionId);
        return;
      }
      const session = store.get(sessionId);
      if (!session) return;
      const command = session.state.pendingCommands[0];
      if (!command) return;
      try {
        const event = await runCommand(
          store,
          sessionId,
          session.state,
          command,
          controller.signal,
        );
        if (!store.get(sessionId)) return;
        if (aborting.has(sessionId) || controller.signal.aborted) {
          aborting.delete(sessionId);
          return;
        }
        applyEvent(store, sessionId, event);
      } catch (error) {
        if (!store.get(sessionId)) return;
        if (aborting.has(sessionId) || controller.signal.aborted) {
          aborting.delete(sessionId);
          return;
        }
        applyEvent(store, sessionId, {
          type: "NODE_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }
  } finally {
    if (inflightAbort.get(sessionId) === controller) {
      inflightAbort.delete(sessionId);
    }
  }
}

async function runCommand(
  store: SessionStore,
  sessionId: string,
  state: ResearchState,
  command: ResearchState["pendingCommands"][0],
  signal?: AbortSignal,
): Promise<ResearchEvent> {
  const messages = store.list(sessionId);
  const images = collectSessionImages(messages);
  const llm: LlmPort = {
    complete: (instructions, prompt) =>
      depsRef.llm.complete(instructions, prompt, signal, images),
    completeWorkspace: depsRef.llm.completeWorkspace
      ? (turn, innerSignal) =>
          depsRef.llm.completeWorkspace!(
            { ...turn, images: turn.images ?? images },
            signal ?? innerSignal,
          )
      : undefined,
  };
  switch (command.type) {
    case "codexGrill": {
      const result = await grillNode(llm, state, messages);
      return {
        type: "GRILL_RESULT",
        done: Boolean(result.done),
        question: result.question ?? undefined,
      };
    }
    case "codexOutline": {
      const outline = await outlineNode(llm, state, command.feedback, messages);
      return { type: "OUTLINE_DRAFTED", outline };
    }
    case "codexQuery": {
      const result = await queryNode(llm, state, messages);
      return {
        type: "QUERY_GENERATED",
        query: result.query,
        queryZh: result.queryZh,
        queryEn: result.queryEn,
        targetQuestion: result.targetQuestion,
      };
    }
    case "search": {
      const sources = normalizeSources(state.snapshot?.sources);
      const result = await depsRef.search.search(command.query, sources, {
        queryZh: command.queryZh,
        queryEn: command.queryEn,
      });
      const unique = mergeUniqueLinks(state.links, result.hits);
      return {
        type: "SEARCH_DONE",
        hits: unique,
        errors: result.errors,
      };
    }
    case "codexFilter": {
      const result = await filterNode(llm, state, messages);
      const draftHits = state.draftRound?.hits ?? [];
      const { cited, unused } = applyHitReviews(draftHits, result);
      return { type: "FILTER_DONE", cited, unused };
    }
    case "extract": {
      const extracts: Record<string, string> = {};
      const pages: Record<
        string,
        { title?: string; links?: Array<{ url: string; title: string }> }
      > = {};
      const draftHits = state.draftRound?.hits ?? [];
      for (const url of command.urls) {
        const hit = draftHits.find((h) => h.url === url || h.normalizedUrl === url);
        if (!hit) continue;
        try {
          const page = depsRef.search.extractPage
            ? await depsRef.search.extractPage(hit.url, hit.source)
            : {
                url: hit.url,
                title: hit.title,
                text: await depsRef.search.extract(hit.url, hit.source),
                links: [],
              };
          if (page.text.trim()) extracts[hit.url] = page.text;
          pages[hit.url] = {
            title: page.title,
            links: (page.links ?? []).slice(0, EXPLORE_CHILD_LINK_LIMIT),
          };
        } catch {
          // keep snippet-only
        }
      }
      return { type: "EXTRACT_DONE", extracts, pages };
    }
    case "codexExplore": {
      const result = await exploreNode(llm, state, messages);
      return {
        type: "EXPLORE_DECIDED",
        urls: result.urls,
        reason: result.reason,
      };
    }
    case "codexFindings": {
      const result = await findingsNode(llm, state, messages);
      return {
        type: "ROUND_FINDINGS",
        findings: result.findings,
        gaps: result.gaps,
        summary: result.summary,
        analysis: result.analysis,
        keywords: result.keywords,
        shouldStop: Boolean(result.shouldStop),
      };
    }
    case "codexReport":
    case "codexReportPlan": {
      const plan = await reportPlanNode(llm, state, messages);
      return { type: "REPORT_PLAN_DRAFTED", plan };
    }
    case "codexReportWrite": {
      const report = await reportWriteNode(llm, state, messages, {
        sessionId,
        images,
        signal,
        onTurn: async (turn, maxTurns) => {
          const current = store.get(sessionId);
          if (!current) return;
          store.save(sessionId, {
            ...current.state,
            reportWrite: { turn, maxTurns },
          });
        },
      });
      return { type: "REPORT_DONE", report };
    }
    case "codexFollowup": {
      const result = await followupNode(llm, state, command.text, messages);
      if (result.kind === "need_search") {
        return { type: "FOLLOWUP_NEED_SEARCH", outline: result.outline };
      }
      if (result.kind === "continue") {
        return { type: "CONTINUE" };
      }
      if (result.kind === "generate_report") {
        return { type: "GENERATE_REPORT" };
      }
      return { type: "FOLLOWUP_ANSWER", text: result.text };
    }
    default:
      throw new Error("未知命令");
  }
}

export function tikhubSearchPort(): SearchPort {
  let agent: DeepResearchAgent | undefined;
  const getAgent = () => {
    agent ||= new DeepResearchAgent({ timeoutMs: 60_000 });
    return agent;
  };
  return {
    async search(query, sources, pair) {
      const result = await getAgent().search(query, sources, pair);
      const hits = sources.flatMap((source) => result.groups[source] ?? []);
      return {
        hits: hitsToLinks(hits, 0).map((h) => ({
          ...h,
          normalizedUrl: normalizeUrl(h.url) || h.url,
        })),
        errors: result.errors,
      };
    },
    extract: (url, source) => getAgent().extract(url, source),
    extractPage: (url, source) => getAgent().extractPage(url, source),
  };
}
