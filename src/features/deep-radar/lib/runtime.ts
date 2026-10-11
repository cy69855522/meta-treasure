import "server-only";
import {
  appendMessages,
  getSession,
  listMessages,
  rewindSession,
  saveSession,
} from "@/features/deep-radar/lib/db";
import { createLlmPort } from "@/features/deep-radar/lib/codex-llm";
import {
  configureOrchestrator,
  tikhubSearchPort,
  type SessionStore,
} from "@/features/deep-radar/lib/research-orchestrator";
import { getSettings } from "@/features/deep-radar/lib/settings";

const sqliteStore: SessionStore = {
  get: (id) => getSession(id),
  save: (id, state, title) => saveSession(id, state, title),
  append: (id, messages, state) => appendMessages(id, messages, state),
  list: (id) => listMessages(id),
  rewind: (id, messageId, keepMessage, resume) => {
    if (!rewindSession(id, messageId, keepMessage, resume)) {
      throw new Error("研究会话不存在");
    }
  },
};

let searchPort: ReturnType<typeof tikhubSearchPort> | undefined;

export function researchStore(): SessionStore {
  wireRuntime();
  return sqliteStore;
}

export function wireRuntime() {
  // Always refresh the LLM port so timeout/protocol fixes apply after HMR
  // without requiring a full Next.js process restart.
  searchPort ||= tikhubSearchPort();
  configureOrchestrator({
    llm: createLlmPort(),
    search: searchPort,
    settings: getSettings,
  });
}
