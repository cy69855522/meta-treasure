import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { RPC_TIMEOUT_MS } from './config.mjs';

/**
 * One JSON-RPC line. A string cut in the middle of an emoji leaves a lone
 * surrogate; JSON.stringify writes it as `\ud83d`, which the app-server's
 * (Rust) parser rejects, dropping the whole message and never answering —
 * the caller then just times out. Replace such halves with U+FFFD.
 */
export function serializeLine(value) {
  const wellFormed = (_key, item) => (typeof item === 'string' ? item.toWellFormed() : item);
  return `${JSON.stringify(value, wellFormed)}\n`;
}

/**
 * JSON-RPC client for one `codex app-server` child process.
 * `onMessage` receives every notification and server-initiated request;
 * `onClose(error, exited)` fires if the child cannot start or dies.
 */
export function startAppServer({ cli, env, onMessage, onClose }) {
  const proc = spawn(cli, ['app-server'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let sequence = 0;

  const send = value => proc.stdin.write(serializeLine(value));
  const reply = (id, result) => send({ id, result });
  const replyError = (id, message, code = -32601) => send({ id, error: { code, message } });

  function rpc(method, params, timeoutMs = RPC_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex ${method} 请求超时`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  }

  function rejectAll(error) {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  }

  createInterface({ input: proc.stdout }).on('line', line => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (!msg.method && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
      return;
    }
    onMessage(msg);
  });

  proc.on('error', e => {
    const error = new Error(`无法启动 Codex CLI: ${e.message}`);
    rejectAll(error);
    onClose(e, false);
  });
  proc.on('exit', () => {
    rejectAll(new Error('Codex 进程退出'));
    onClose(new Error('Codex 进程退出，请重启执行服务'), true);
  });

  const ready = rpc('initialize', {
    clientInfo: { name: 'progress', version: '1.0.0' },
    capabilities: { experimentalApi: true },
  }).then(() => send({ method: 'initialized' }));
  ready.catch(() => {});

  return { rpc, send, reply, replyError, ready, kill: () => proc.kill() };
}
