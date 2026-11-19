import { createServer } from 'node:http';
import { realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startAppServer } from './codex-service/app-server.mjs';
import { claimRequest, findRequest, removeRequest } from './codex-service/approvals.mjs';
import {
  SERVICE_VERSION,
  childEnvironment,
  ensureDirectories,
  readToken,
  resolveCli,
  stateDir,
  testPort,
  workspaceRoot,
} from './codex-service/config.mjs';
import { createDirectTurns } from './codex-service/direct-turns.mjs';
import {
  applyPresentation,
  normalizeSkillPlacement,
  rulePart,
  skillPart,
  stripExecutionHistory,
  validRule,
  validSkill,
} from './codex-service/messages.mjs';
import { busy, createSessionStore, publicView } from './codex-service/sessions.mjs';
import {
  buildTurnInput,
  ensureThread,
  invalidateThread,
  reconcileRetry,
  reconcileThread,
  threadConfig,
} from './codex-service/threads.mjs';
import { applyNotification, failSession } from './codex-service/turn-events.mjs';

ensureDirectories();
const token = readToken();
const store = createSessionStore(stateDir);
const { save } = store;

const SUPPORTED_CLIENT_REQUESTS = ['item/tool/call', 'item/tool/requestUserInput'];
const callIdOf = request => String(request.params?.callId || request.id);

function handleMessage(msg) {
  if (direct.handleMessage(msg)) return;
  const p = msg.params || {};
  const s = store.byThread(p.threadId);
  if (!s) {
    if (msg.id !== undefined) appServer.replyError(msg.id, 'Unknown thread');
    return;
  }
  if (msg.id !== undefined) {
    if (!SUPPORTED_CLIENT_REQUESTS.includes(msg.method)) {
      appServer.replyError(msg.id, 'Unsupported client request');
      return;
    }
    s.requests.push({ id: msg.id, method: msg.method, params: p });
  } else {
    applyNotification(s, msg);
  }
  save(s);
}

function handleClose(error, exited) {
  for (const s of store.all()) {
    if (!busy(s)) continue;
    failSession(s, error);
    save(s);
  }
  if (exited) {
    process.exitCode = 1;
    server.close();
  }
}

const appServer = startAppServer({
  cli: resolveCli(),
  env: childEnvironment(),
  onMessage: handleMessage,
  onClose: handleClose,
});
const { rpc } = appServer;
const direct = createDirectTurns({ rpc, ready: appServer.ready, replyError: appServer.replyError });

async function runTurn(s, body, generation) {
  const stale = () => s.generation !== generation;
  await appServer.ready;
  if (stale()) return;
  reconcileThread(s, {
    model: body.model,
    modelProvider: body.modelProvider,
    modelId: body.modelId,
    libraryKey: typeof body.libraryKey === 'string' ? body.libraryKey : '',
    toolsKey: typeof body.toolsKey === 'string' ? body.toolsKey : '',
  });
  save(s);
  const config = threadConfig(s, body, workspaceRoot);
  if (!(await ensureThread({ s, config, tools: body.tools, rpc, save, isStale: stale }))) return;
  await rpc('turn/start', { threadId: s.threadId, input: buildTurnInput(s, body) });
  s.needsHistory = false;
  save(s);
}

/** Per-scope commands. Return a value to reply with it instead of the session view. */
const actions = {
  state() {},

  init(s, b) {
    if (s.initialized) return;
    s.messages = b.messages;
    stripExecutionHistory(s);
    normalizeSkillPlacement(s.messages);
    s.initialized = true;
    s.needsHistory = true;
    save(s);
  },

  directory(s, b) {
    if (busy(s)) throw new Error('请先停止当前对话');
    const cwd = realpathSync(String(b.cwd || '').trim());
    if (!statSync(cwd).isDirectory()) throw new Error('代码目录不是文件夹');
    s.cwd = cwd;
    invalidateThread(s, 'directory-changed');
    save(s);
  },

  model(s, b) {
    if (busy(s)) throw new Error('请先停止当前任务');
    reconcileThread(s, { model: b.model, modelProvider: b.modelProvider, modelId: b.modelId });
    save(s);
  },

  start(s, b) {
    if (busy(s)) throw new Error('当前任务仍在进行');
    const images = (Array.isArray(b.images) ? b.images : []).slice(0, 9);
    if (!b.text?.trim() && !images.length) throw new Error('消息或图片不能为空');
    reconcileRetry(s, b.retry);
    if (!b.retry) {
      s.messages.push({
        id: randomUUID(),
        role: 'user',
        parts: [
          ...images.map(image => ({ type: 'image', ...image })),
          ...(b.text?.trim() ? [{ type: 'text', text: b.text }] : []),
        ],
      });
    } else {
      const user = s.messages.findLast(message => message.role === 'user');
      if (user) user.parts = user.parts.filter(part => part.type !== 'skill' && part.type !== 'rule');
    }
    s.activeSkills = (Array.isArray(b.skills) ? b.skills : []).filter(validSkill).map(skillPart);
    s.activeRules = (Array.isArray(b.rules) ? b.rules : []).filter(validRule).map(rulePart);
    s.activeSearches = [];
    s.turnAnswerIds = [];
    s.turnMessageId = null;
    s.turnTextByItem = {};
    s.turnId = null;
    s.status = 'submitted';
    s.error = null;
    s.requests = [];
    save(s);
    const generation = (s.generation = (s.generation || 0) + 1);
    void runTurn(s, b, generation).catch(e => {
      if (s.generation !== generation) return;
      failSession(s, e);
      save(s);
    });
  },

  async stop(s) {
    if (busy(s) && !s.turnId) {
      s.generation = (s.generation || 0) + 1;
      s.status = 'ready';
      s.requests = [];
      save(s);
    } else if (busy(s)) {
      await rpc('turn/interrupt', { threadId: s.threadId, turnId: s.turnId });
      // Drop leftover requests now; turn/completed finalizes the status.
      s.requests = [];
      save(s);
    }
  },

  rewind(s, b) {
    if (busy(s)) throw new Error('请先停止当前任务');
    const index = s.messages.findIndex(m => m.id === b.messageId);
    if (index < 0) throw new Error('未找到消息，请刷新后重试');
    s.messages = s.messages.slice(0, index + (b.keepMessage ? 1 : 0));
    // Rebuild a new context from the retained prefix. Never resume discarded turns.
    invalidateThread(s, 'rewind');
    s.status = 'ready';
    s.error = null;
    save(s);
  },

  /** Take ownership of a tool request. Losing the race is a normal answer, not an error. */
  claim(s, b) {
    const request = claimRequest(s, b.id);
    if (!request) return { claimed: false };
    applyPresentation(s, b.presentation, { callId: callIdOf(request), final: false });
    save(s);
    return { claimed: true };
  },

  /** Answer a tool request. Idempotent: an unknown or already-answered request is a no-op. */
  respond(s, b) {
    const request = findRequest(s, b.id);
    if (!request) return;
    applyPresentation(s, b.presentation, { callId: callIdOf(request), final: true });
    appServer.reply(request.id, b.result);
    removeRequest(s, request);
    save(s);
  },
};

async function listModels() {
  await appServer.ready;
  const models = [];
  let cursor = null;
  do {
    const page = await rpc('model/list', { includeHidden: false, limit: 100, ...(cursor ? { cursor } : {}) });
    models.push(...(page?.data || []));
    const next = page?.nextCursor || null;
    if (!next || next === cursor) break;
    cursor = next;
  } while (cursor);
  return models;
}

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end('{}'); return; }
  try {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 8e6) throw new Error('请求过大'); }
    const b = raw ? JSON.parse(raw) : {};
    const name = String(req.url || '').slice(1);

    if (name === 'health') { await appServer.ready; res.end(JSON.stringify({ ok: true, version: SERVICE_VERSION })); return; }
    if (name === 'shutdown') {
      res.end(JSON.stringify({ ok: true }), () => {
        appServer.kill();
        server.close(() => process.exit(0));
      });
      return;
    }
    if (name === 'models') { res.end(JSON.stringify({ models: await listModels() })); return; }
    if (name === 'complete') { await direct.routes.complete(req, res, b); return; }
    if (name === 'workspace') { await direct.routes.workspace(req, res, b); return; }

    const action = Object.hasOwn(actions, name) ? actions[name] : null;
    if (!action) throw new Error('未知操作');
    const s = store.get(b.scope);
    const result = await action(s, b);
    res.end(JSON.stringify(result ?? publicView(s)));
  } catch (e) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(testPort || join(stateDir, 'service.sock'), testPort ? '127.0.0.1' : undefined);
process.on('SIGTERM', () => { appServer.kill(); server.close(); });
