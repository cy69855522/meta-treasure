import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { requestView } from './approvals.mjs';
import { normalizeSkillPlacement, stripExecutionHistory } from './messages.mjs';

const SCOPE_RE = /^(steward|[a-f0-9-]{36})$/;

export const busy = s => s.status === 'submitted' || s.status === 'streaming';

/** Forget everything that only exists while a turn is running. */
export function clearTurnState(s) {
  s.requests = [];
  s.activeSkills = [];
  s.activeRules = [];
  s.activeSearches = [];
  s.turnAnswerIds = [];
  s.turnMessageId = null;
  s.turnTextByItem = {};
}

/** What clients may see. Thread/turn internals stay inside the service. */
export function publicView(s, now = Date.now()) {
  return {
    scope: s.scope,
    rev: s.rev || 0,
    initialized: Boolean(s.initialized),
    messages: s.messages,
    requests: s.requests.map(request => requestView(request, now)),
    status: s.status,
    error: s.error ?? null,
    cwd: s.cwd ?? null,
    modelId: s.modelId ?? null,
    model: s.model ?? null,
    modelProvider: s.modelProvider ?? null,
  };
}

export function createSessionStore(dir) {
  const sessions = new Map();

  /** Persist and bump `rev`, the change counter clients poll against. */
  function save(s) {
    s.rev = (s.rev || 0) + 1;
    const file = join(dir, `${s.scope}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(s), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }

  function get(scope) {
    if (!SCOPE_RE.test(String(scope))) throw new Error('无效项目');
    if (!sessions.has(scope)) {
      let s;
      try { s = JSON.parse(readFileSync(join(dir, `${scope}.json`), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      s ||= { scope, messages: [], requests: [], status: 'ready', cwd: null, threadId: null, modelId: null, model: null, modelProvider: null };
      stripExecutionHistory(s);
      normalizeSkillPlacement(s.messages || []);
      if (s.modelId === 'codex-default') s.modelId = null;
      if (busy(s)) { s.status = 'error'; s.error = 'Codex 服务重启，上一轮已中断，请重试。'; }
      s.rev ||= 0;
      clearTurnState(s);
      sessions.set(scope, s);
    }
    return sessions.get(scope);
  }

  const byThread = threadId => (threadId ? [...sessions.values()].find(s => s.threadId === threadId) : undefined);
  const all = () => [...sessions.values()];

  return { save, get, byThread, all };
}
