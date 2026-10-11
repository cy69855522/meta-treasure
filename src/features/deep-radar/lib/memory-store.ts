import { createInitialState, type ChatMessage, type NewMessage, type ResearchSession, type ResearchState } from "@/features/deep-radar/lib/research-types";
import type { SessionStore } from "@/features/deep-radar/lib/research-orchestrator";
import { cutIndex, restoreAfterCut, type CheckpointedMessage } from "@/features/deep-radar/lib/research-rewind";

export function memoryStore(): SessionStore & { session: ResearchSession; messages: ChatMessage[] } {
  const now = new Date().toISOString();
  const checkpoints = new Map<string, ResearchState>();
  const bag = {
    session: {
      id: "s1",
      title: "新研究",
      state: createInitialState(),
      createdAt: now,
      updatedAt: now,
    } satisfies ResearchSession,
    messages: [] as ChatMessage[],
    get(id: string) {
      if (id !== bag.session.id) return null;
      return bag.session;
    },
    save(_id: string, state: ResearchState, title?: string) {
      bag.session = {
        ...bag.session,
        state,
        title: title ?? (state.outline?.goal || bag.session.title),
        updatedAt: new Date().toISOString(),
      };
    },
    append(_id: string, messages: NewMessage[], state?: ResearchState) {
      const saved = messages.map((message, index) => ({
        ...message,
        id: `m${bag.messages.length + index + 1}`,
        sessionId: bag.session.id,
        createdAt: new Date().toISOString(),
      }));
      if (state) {
        for (const message of saved) checkpoints.set(message.id, structuredClone(state));
      }
      bag.messages.push(...saved);
      return saved;
    },
    list() {
      return bag.messages;
    },
    rewind(_id: string, messageId: string, keepMessage: boolean, resume = keepMessage) {
      const checkpointed: CheckpointedMessage[] = bag.messages.map((message) => ({
        ...message,
        checkpoint: checkpoints.get(message.id) ?? null,
      }));
      const cut = cutIndex(checkpointed, messageId, keepMessage);
      const kept = bag.messages.slice(0, cut);
      const restored = restoreAfterCut(checkpointed.slice(0, cut), resume);
      for (const message of bag.messages.slice(cut)) checkpoints.delete(message.id);
      bag.messages = kept;
      bag.session = {
        ...bag.session,
        state: restored,
        title:
          restored.phase === "idle"
            ? "新研究"
            : restored.outline?.goal?.slice(0, 40) || bag.session.title,
        updatedAt: new Date().toISOString(),
      };
    },
  };
  return bag;
}
