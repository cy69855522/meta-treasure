import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import {
  COMPLETE_TURN_TIMEOUT_MS,
  ERROR_RETRY_IDLE_MS,
  KEEPALIVE_MS,
  WORKSPACE_TURN_TIMEOUT_MS,
  deepRadarWorkspace,
} from './config.mjs';
import { FATAL_PROVIDER_RE } from './sanitize.mjs';

const directImageInput = body =>
  (Array.isArray(body.images) ? body.images : [])
    .slice(0, 9)
    .filter(image => typeof image?.path === 'string')
    .map(image => ({ type: 'localImage', path: image.path }));

const directThreadConfig = (body, cwd, sandbox) => ({
  cwd,
  sandbox,
  approvalPolicy: 'never',
  developerInstructions: String(body.instructions || ''),
  ...(body.model ? { model: body.model } : {}),
  ...(body.modelProvider ? { modelProvider: body.modelProvider } : {}),
});

function assertReportCwd(cwd) {
  const root = resolve(tmpdir(), 'deep-radar-reports');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const absolute = resolve(String(cwd || ''));
  if (!existsSync(absolute)) throw new Error('工作区不存在');
  const real = realpathSync(absolute);
  const realRoot = realpathSync(root);
  const rel = relative(realRoot, real);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('工作区路径不合法');
  return real;
}

const writeNdjson = (res, value) => res.write(`${JSON.stringify(value)}\n`);

/**
 * Deep Radar's stateless turns: no session file, no tool calls, results
 * streamed as NDJSON with keepalive pings so the client can use an idle timeout.
 */
export function createDirectTurns({ rpc, ready, replyError }) {
  const waiters = new Map();

  function waitForTurn(threadId, timeoutMs, label) {
    return new Promise((resolveTurn, rejectTurn) => {
      const startedAt = Date.now();
      const wallMs = Math.max(timeoutMs * 2, timeoutMs + 600_000);
      const waiter = {
        textByItem: new Map(),
        lastEvent: '',
        lastEventAt: startedAt,
        lastError: '',
        baseIdleMs: timeoutMs,
        timer: null,
        wallTimer: null,
        turnId: null,
        interruptRequested: false,
        done: false,
        arm(nextIdleMs) {
          if (waiter.timer) clearTimeout(waiter.timer);
          waiter.timer = setTimeout(() => {
            const detail = waiter.lastError ? `；此前错误：${waiter.lastError}` : '';
            waiter.reject(new Error(
              `Codex 生成超时：${label}（${Math.round(nextIdleMs / 1000)} 秒无进度；最后事件 ${waiter.lastEvent || '无'}${detail}）`,
            ));
          }, nextIdleMs);
        },
      };
      const settle = (error, value) => {
        if (waiter.done || !waiters.has(threadId)) return;
        waiter.done = true;
        waiters.delete(threadId);
        clearTimeout(waiter.timer);
        clearTimeout(waiter.wallTimer);
        if (error) rejectTurn(error);
        else resolveTurn(value);
      };
      waiter.resolve = value => settle(null, value);
      waiter.reject = error => settle(error);
      waiter.wallTimer = setTimeout(
        () => waiter.reject(new Error(`Codex 生成墙钟超时：${label}`)),
        wallMs,
      );
      waiters.set(threadId, waiter);
      waiter.arm(timeoutMs);
    });
  }

  async function runTurn(threadId, body, timeoutMs, label) {
    const text = String(body.text || '');
    if (!text.trim()) throw new Error('prompt 为空');
    const waiting = waitForTurn(threadId, timeoutMs, label);
    try {
      await rpc('turn/start', {
        threadId,
        input: [...directImageInput(body), { type: 'text', text, text_elements: [] }],
      });
    } catch (error) {
      waiters.get(threadId)?.reject(error);
    }
    return waiting;
  }

  const startThread = async (body, cwd, sandbox) =>
    (await rpc('thread/start', directThreadConfig(body, cwd, sandbox))).thread.id;

  function interrupt(threadId) {
    const waiter = waiters.get(threadId);
    if (!waiter || waiter.done) return;
    waiter.interruptRequested = true;
    if (!waiter.turnId) return;
    void rpc('turn/interrupt', { threadId, turnId: waiter.turnId }).catch(() => {
      waiter.reject(new Error('已停止'));
    });
  }

  function watchAbort(req, res, getThreadId) {
    const stop = () => {
      const threadId = getThreadId();
      if (threadId) interrupt(threadId);
    };
    req.on('aborted', stop);
    res.on('close', () => {
      if (!res.writableEnded) stop();
    });
  }

  async function streamLongJob(res, work) {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
    const ping = setInterval(() => {
      try { writeNdjson(res, { t: 'ping', at: Date.now() }); } catch { /* client disconnected */ }
    }, KEEPALIVE_MS);
    try {
      writeNdjson(res, { t: 'ok', ...(await work()) });
    } catch (error) {
      writeNdjson(res, { t: 'error', error: error instanceof Error ? error.message : String(error) });
    } finally {
      clearInterval(ping);
      res.end();
    }
  }

  /** Returns true if the message belonged to a direct turn. */
  function handleMessage(msg) {
    const p = msg.params || {};
    const direct = p.threadId ? waiters.get(p.threadId) : undefined;
    if (!direct) return false;
    const method = String(msg.method || '');
    direct.lastEvent = method;
    direct.lastEventAt = Date.now();
    if (msg.id !== undefined) {
      replyError(msg.id, 'Unsupported client request');
      return true;
    }
    if (method !== 'turn/completed' && method !== 'error') direct.arm?.(direct.baseIdleMs);
    if (method === 'item/agentMessage/delta') {
      direct.textByItem.set(p.itemId, (direct.textByItem.get(p.itemId) || '') + (p.delta || ''));
    } else if (method === 'item/completed' && p.item?.type === 'agentMessage') {
      direct.textByItem.set(p.item.id, p.item.text || '');
    } else if (method === 'turn/started') {
      direct.turnId = p.turn?.id || direct.turnId;
      if (direct.interruptRequested && direct.turnId) {
        void rpc('turn/interrupt', { threadId: p.threadId, turnId: direct.turnId })
          .catch(() => direct.reject(new Error('已停止')));
      }
    } else if (method === 'turn/completed') {
      const status = String(p.turn?.status || '');
      const error = p.turn?.error?.message;
      if (direct.interruptRequested || status === 'interrupted' || status === 'cancelled') {
        direct.reject(new Error('已停止'));
      } else if (error || status === 'failed') {
        direct.reject(new Error(error || 'Codex 执行失败'));
      } else {
        direct.resolve([...direct.textByItem.values()].join(''));
      }
    } else if (method === 'error') {
      const error = String(p.error?.message || p.message || p.error || 'Codex 执行失败');
      direct.lastError = error;
      if (FATAL_PROVIDER_RE.test(error) || !p.willRetry) {
        direct.reject(new Error(error));
      } else {
        // The app-server owns provider retries; keep waiting while it says
        // willRetry. The idle and wall-clock timers remain our safety net.
        direct.arm?.(ERROR_RETRY_IDLE_MS);
      }
    }
    return true;
  }

  const routes = {
    async complete(req, res, body) {
      let threadId = '';
      watchAbort(req, res, () => threadId);
      await streamLongJob(res, async () => {
        await ready;
        threadId = await startThread(body, deepRadarWorkspace, 'read-only');
        if (req.aborted) interrupt(threadId);
        const text = await runTurn(threadId, body, COMPLETE_TURN_TIMEOUT_MS, 'deep-radar-complete');
        return { text };
      });
    },
    async workspace(req, res, body) {
      let threadId = typeof body.threadId === 'string' ? body.threadId : '';
      watchAbort(req, res, () => threadId);
      await streamLongJob(res, async () => {
        await ready;
        const cwd = assertReportCwd(body.cwd);
        if (threadId) {
          await rpc('thread/resume', { ...directThreadConfig(body, cwd, 'workspace-write'), threadId });
        } else {
          threadId = await startThread(body, cwd, 'workspace-write');
        }
        if (req.aborted) interrupt(threadId);
        const text = await runTurn(threadId, body, WORKSPACE_TURN_TIMEOUT_MS, 'deep-radar-workspace');
        return { text, threadId };
      });
    },
  };

  return { handleMessage, routes };
}
