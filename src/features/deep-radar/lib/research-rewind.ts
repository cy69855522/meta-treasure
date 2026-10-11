import {
  createInitialState,
  type ChatMessage,
  type Command,
  type Outline,
  type Phase,
  type Report,
  type ReportPlan,
  type ResearchLink,
  type ResearchRound,
  type ResearchState,
} from "@/features/deep-radar/lib/research-types";

export type CheckpointedMessage = ChatMessage & {
  checkpoint?: ResearchState | null;
};

export function cutIndex(
  messages: Array<{ id: string }>,
  messageId: string,
  keepMessage: boolean,
) {
  const found = messages.findIndex((message) => message.id === messageId);
  if (found < 0) throw new Error("消息不存在");
  return keepMessage ? found + 1 : found;
}

export function lostUserQuestion(
  messages: Array<{ id: string; role: string; kind?: string; content: string }>,
  messageId: string,
): string {
  const cut = cutIndex(messages, messageId, false);
  const found = messages
    .slice(cut)
    .find((message) => message.role === "user" && (message.kind ?? "text") === "text");
  return found?.content ?? "";
}

export function appendComposerDraft(current: string, incoming: string): string {
  if (!incoming) return current;
  if (!current) return incoming;
  return `${current}\n${incoming}`;
}

/** Map UI rewind/retry + target message to store.rewind options. */
export function rewindActionOptions(
  action: "rewind" | "retry",
  target: { role: string },
): { keepMessage: boolean; resume: boolean } {
  if (action === "retry") {
    return { keepMessage: target.role === "user", resume: true };
  }
  // rewind user → restore composer, do not auto-continue
  // rewind assistant → delete that answer and auto-continue research flow
  return {
    keepMessage: false,
    resume: target.role === "assistant",
  };
}

export function settleAfterRewind(
  state: ResearchState,
  resume: boolean,
): ResearchState {
  if (resume) {
    return {
      ...state,
      draftRound: null,
      stopRequested: false,
      error: null,
    };
  }
  const next: ResearchState = {
    ...state,
    pendingCommands: [],
    draftRound: null,
    stopRequested: false,
    error: null,
  };
  if (next.phase === "looping" || next.phase === "reporting") {
    next.phase = "paused";
  }
  return next;
}

export function rebuildStateFromMessages(messages: ChatMessage[]): ResearchState {
  const state = createInitialState();
  let grillCount = 0;
  for (const message of messages) {
    if (message.kind === "text" && message.role === "user" && state.phase === "idle") {
      state.phase = "grilling";
    }
    if (message.kind === "text" && message.role === "assistant") {
      grillCount += 1;
      if (state.phase === "idle") state.phase = "grilling";
    }
    if (message.kind === "outline" && message.payload) {
      state.pendingOutline = message.payload as Outline;
      state.phase =
        state.phase === "ready" || state.phase === "supplement_pending"
          ? "supplement_pending"
          : "outline_pending";
    }
    if (message.kind === "status" && message.content.includes("已批准")) {
      state.outline = state.pendingOutline ?? state.outline;
      state.pendingOutline = null;
      state.phase = "looping";
    }
    if (message.kind === "round" && message.payload) {
      const payload = message.payload as {
        round: ResearchRound;
        cited?: ResearchLink[];
        unused?: ResearchLink[];
      };
      if (payload.round) state.rounds.push(payload.round);
      for (const link of [...(payload.cited ?? []), ...(payload.unused ?? [])]) {
        if (!state.links.some((row) => row.normalizedUrl === link.normalizedUrl)) {
          state.links.push(link);
        }
      }
      state.phase = "looping";
    }
    if (message.kind === "status" && message.content.includes("冻结")) {
      state.phase = "paused";
    }
    if (message.kind === "report_plan" && message.payload) {
      state.reportPlan = message.payload as ReportPlan;
      state.phase = "reporting";
    }
    if (message.kind === "report" && message.payload) {
      state.report = message.payload as Report;
      state.phase = "ready";
    }
  }
  state.grillCount = grillCount;
  if (state.phase === "looping") state.phase = "paused";
  return state;
}

export function restoreAfterCut(
  kept: CheckpointedMessage[],
  resume: boolean,
): ResearchState {
  if (kept.length === 0) return createInitialState();
  const last = kept[kept.length - 1];
  const base = last.checkpoint
    ? (structuredClone(last.checkpoint) as ResearchState)
    : rebuildStateFromMessages(kept);
  return settleAfterRewind(base, resume);
}

export function resumeReplay(
  state: ResearchState,
  cut: ChatMessage,
  kept: ChatMessage[],
): ResearchState {
  if (cut.role !== "assistant") return state;
  const inferred = inferReplayCommand(cut, state, kept);
  const pending = state.pendingCommands[0];
  const command =
    pending && (!inferred || pending.type === inferred.type) ? pending : inferred;
  if (!command) {
    return {
      ...state,
      draftRound: null,
      stopRequested: false,
      error: null,
    };
  }
  const next: ResearchState = {
    ...state,
    pendingCommands: [command],
    draftRound: null,
    stopRequested: false,
    error: null,
    phase: phaseForReplayCommand(command, state),
  };
  if (command.type === "codexQuery") {
    next.outline = state.outline ?? state.pendingOutline;
    if (!state.outline) next.pendingOutline = null;
  }
  if (command.type === "codexReport" || command.type === "codexReportPlan") {
    next.report = null;
    next.reportPlan = null;
  }
  if (command.type === "codexReportWrite") next.report = null;
  return next;
}

function inferReplayCommand(
  cut: ChatMessage,
  state: ResearchState,
  kept: ChatMessage[],
): Command | null {
  if (cut.kind === "outline") {
    const lastUserIdx = kept.findLastIndex(
      (message) => message.role === "user" && message.kind === "text",
    );
    const lastOutlineIdx = kept.findLastIndex((message) => message.kind === "outline");
    if (lastUserIdx >= 0 && lastUserIdx > lastOutlineIdx && lastOutlineIdx >= 0) {
      return { type: "codexOutline", feedback: kept[lastUserIdx].content };
    }
    return { type: "codexOutline" };
  }
  if (cut.kind === "round") return { type: "codexQuery" };
  if (cut.kind === "report_plan") return { type: "codexReportPlan" };
  if (cut.kind === "report") {
    return state.reportPlan
      ? { type: "codexReportWrite" }
      : { type: "codexReportPlan" };
  }
  if (cut.kind === "text") {
    if (state.phase === "ready" || state.phase === "paused") {
      const lastUser = [...kept]
        .reverse()
        .find((message) => message.role === "user" && message.kind === "text");
      return { type: "codexFollowup", text: lastUser?.content ?? "" };
    }
    return { type: "codexGrill" };
  }
  return null;
}

function phaseForReplayCommand(command: Command, state: ResearchState): Phase {
  switch (command.type) {
    case "codexGrill":
      return "grilling";
    case "codexOutline":
      if (state.phase === "supplement_pending" || state.phase === "ready") {
        return "supplement_pending";
      }
      if (state.phase === "outline_pending") return "outline_pending";
      return "grilling";
    case "codexQuery":
      return "looping";
    case "codexReport":
    case "codexReportPlan":
    case "codexReportWrite":
      return "reporting";
    case "codexFollowup":
      return state.phase === "paused" ? "paused" : "ready";
    default:
      return state.phase;
  }
}
