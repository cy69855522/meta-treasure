import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const root = process.cwd();
const serviceVersion = 19;
const testPort = process.env.PROGRESS_CODEX_TEST_PORT
  ? Number(process.env.PROGRESS_CODEX_TEST_PORT)
  : null;
const dir = process.env.PROGRESS_CODEX_STATE_DIR || join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'progress-codex');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const progressCodexHome = process.env.PROGRESS_CODEX_HOME || join(homedir(), '.progress', 'codex');
mkdirSync(progressCodexHome, { recursive: true, mode: 0o700 });
const token = readFileSync(join(dir, 'token'), 'utf8').trim();

const sessions = new Map();
const pending = new Map();
let sequence = 0;
function childEnvironment(extra = {}) {
  const env = { ...process.env, ...extra, CODEX_HOME: progressCodexHome };
  // The bridge is launched by Next.js dev and otherwise leaks
  // NODE_ENV=development into `next build`. Let each child command choose its
  // own mode, as npm/Next.js normally does when launched from a shell.
  delete env.NODE_ENV;
  return env;
}
const cli = process.env.CODEX_BIN || (process.env.PATH || '').split(':').map(d => join(d, 'codex')).find(f => existsSync(f)) || (existsSync('/usr/lib/chatgpt/resources/codex') ? '/usr/lib/chatgpt/resources/codex' : 'codex');
const proc = spawn(cli, ['app-server'], { env: childEnvironment(), stdio: ['pipe', 'pipe', 'inherit'] });
const send = value => proc.stdin.write(JSON.stringify(value) + '\n');
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex ${method} 请求超时`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
    send({ id, method, params });
  });
}
function save(s) {
  const file = join(dir, s.scope + '.json');
  writeFileSync(file + '.tmp', JSON.stringify(s), { mode: 0o600 });
  renameSync(file + '.tmp', file);
}
const validSkill = skill => skill && typeof skill.id === 'string' && typeof skill.name === 'string' && typeof skill.command === 'string';
const skillKey = skill => skill.id || skill.command;
function mergeSkills(message, skills) {
  if (!message || !Array.isArray(message.parts)) return;
  const merged = new Map();
  for (const skill of [...message.parts.filter(part => part.type === 'skill'), ...skills].filter(validSkill)) {
    merged.set(skillKey(skill), { type: 'skill', id: skill.id, name: skill.name, command: skill.command });
  }
  message.parts = [...merged.values(), ...message.parts.filter(part => part.type !== 'skill')];
}
function normalizeSkillPlacement(messages) {
  let pending = [];
  for (const message of messages) {
    const own = (message.parts || []).filter(part => part.type === 'skill' && validSkill(part));
    if (message.role === 'user' && own.length) {
      pending = own;
      message.parts = message.parts.filter(part => part.type !== 'skill');
    } else if (message.role === 'assistant' && (message.parts || []).some(part => part.type === 'text')) {
      if (pending.length) mergeSkills(message, pending);
      pending = [];
    }
  }
}
function ensureAssistantMessage(s, id) {
  let message = s.messages.find(candidate => candidate.id === id);
  if (!message) {
    message = { id, role: 'assistant', parts: [{ type: 'text', text: '' }] };
    mergeSkills(message, s.activeSkills || []);
    s.messages.push(message);
    s.turnAnswerIds ||= [];
    s.turnAnswerIds.push(id);
  }
  return message;
}
function stripExecutionHistory(s) {
  s.messages = (Array.isArray(s.messages) ? s.messages : [])
    .map(message => ({ ...message, parts: (message.parts || []).filter(part => part.type !== 'activity') }))
    .filter(message => message.parts.length > 0);
  for (const key of ['items', 'diff', 'turnPolicy', 'currentPlan', 'agenticContinuationCount', 'lastFailedCommand', 'loopGuardError', 'turnActivityMessageId']) delete s[key];
}
function session(scope) {
  if (!/^(steward|[a-f0-9-]{36})$/.test(scope)) throw new Error('无效项目');
  if (!sessions.has(scope)) {
    let s;
    try { s = JSON.parse(readFileSync(join(dir, scope + '.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    s ||= { scope, messages: [], requests: [], status: 'ready', cwd: null, threadId: null, modelId: null, model: null, modelProvider: null };
    stripExecutionHistory(s);
    normalizeSkillPlacement(s.messages || []);
    if (s.modelId === 'codex-default') s.modelId = null;
    if (s.status === 'submitted' || s.status === 'streaming') { s.status = 'error'; s.error = 'Codex 服务重启，上一轮已中断，请重试。'; }
    s.requests = []; s.activeSkills = []; s.turnAnswerIds = [];
    sessions.set(scope, s);
  }
  return sessions.get(scope);
}
const busy = s => ['submitted', 'streaming'].includes(s.status);
const isContentFilterError = error => /content[_ ]filter|内容过滤/i.test(String(error?.message || error || ''));
function readableError(error) {
  if (isContentFilterError(error)) return '模型服务因内容过滤中断了本轮输出，可点击重试。';
  return String(error?.message || error);
}
function fail(s, error) {
  s.status = 'error'; s.error = readableError(error); s.requests = [];
  s.activeSkills = []; save(s);
}
createInterface({ input: proc.stdout }).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!msg.method && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); return;
  }
  const p = msg.params || {};
  const s = [...sessions.values()].find(s => s.threadId === p.threadId);
  if (!s) { if (msg.id !== undefined) send({ id: msg.id, error: { code: -32601, message: 'Unknown thread' } }); return; }
  if (msg.id !== undefined) {
    const supported = ['item/tool/call', 'item/tool/requestUserInput'];
    if (!supported.includes(msg.method)) { send({ id: msg.id, error: { code: -32601, message: 'Unsupported client request' } }); return; }
    const request = { id: msg.id, method: msg.method, params: p };
    s.requests.push(request);
  } else if (msg.method === 'serverRequest/resolved') {
    s.requests = s.requests.filter(r => String(r.id) !== String(p.requestId));
  } else if (msg.method === 'turn/started') {
    s.turnId = p.turn.id; s.status = 'streaming';
  } else if (msg.method === 'item/agentMessage/delta') {
    const m = ensureAssistantMessage(s, p.itemId);
    let textPart = m.parts.find(part => part.type === 'text');
    if (!textPart) { textPart = { type: 'text', text: '' }; m.parts.push(textPart); }
    textPart.text += p.delta;
  } else if (msg.method === 'item/completed' && p.item?.type === 'agentMessage') {
    const m = ensureAssistantMessage(s, p.item.id);
    m.parts = [...m.parts.filter(part => part.type === 'skill'), { type: 'text', text: p.item.text }];
  } else if (msg.method === 'turn/completed') {
    const lastAnswerId = (s.turnAnswerIds || []).at(-1);
    if (lastAnswerId) mergeSkills(s.messages.find(message => message.id === lastAnswerId), s.activeSkills || []);
    const turnError = p.turn.error?.message || '';
    const turnStatus = String(p.turn.status || '');
    // interrupted / cancelled means the user stopped or rejected — back to ready, not error.
    if (turnStatus === 'failed') {
      s.status = 'error';
      s.error = turnError ? readableError(turnError) : 'Codex 执行失败';
    } else {
      s.status = 'ready';
      s.error = null;
    }
    s.requests = []; s.activeSkills = [];
  } else if (msg.method === 'error' && !p.willRetry) fail(s, new Error(p.error?.message || 'Codex 执行失败'));
  save(s);
});
proc.on('error', e => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('无法启动 Codex CLI: ' + e.message)); } pending.clear(); for (const s of sessions.values()) if (busy(s)) fail(s, e); });
proc.on('exit', () => {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex 进程退出')); }
  pending.clear();
  for (const s of sessions.values()) if (busy(s)) fail(s, new Error('Codex 进程退出，请重启执行服务'));
  process.exitCode = 1;
  server.close();
});
const ready = rpc('initialize', { clientInfo: { name: 'progress', version: '1.0.0' }, capabilities: { experimentalApi: true } }).then(() => send({ method: 'initialized' }));
ready.catch(() => {});
async function start(s, body, generation) {
  await ready;
  if (s.generation !== generation) return;
  const model = body.model || null;
  const modelProvider = body.modelProvider || null;
  if (s.threadId && (s.model !== model || s.modelProvider !== modelProvider)) {
    s.threadId = null;
    s.needsHistory = true;
  }
  s.modelId = body.modelId || null;
  s.model = model;
  s.modelProvider = modelProvider;
  const config = { cwd: s.cwd || root, sandbox: 'read-only', approvalPolicy: 'never', developerInstructions: body.instructions, ...(model ? { model } : {}), ...(modelProvider ? { modelProvider } : {}) };
  if (s.threadId) await rpc('thread/resume', { ...config, threadId: s.threadId });
  else {
    const result = await rpc('thread/start', { ...config, dynamicTools: body.tools });
    if (s.generation !== generation) return;
    s.threadId = result.thread.id; save(s);
  }
  if (s.generation !== generation) return;
  // Codex receives standing guidance through developerInstructions. When a
  // thread must be rebuilt, restore only compact conversation text instead of
  // replaying terminal output, approval payloads, and activity internals.
  const compactHistory = s.needsHistory
    ? s.messages.slice(0, -1).slice(-40).map(message => ({
        role: message.role,
        text: (message.parts || []).filter(part => part.type === 'text').map(part => part.text || '').join('').slice(0, 12000),
        skills: (message.parts || []).filter(part => part.type === 'skill').map(part => part.name),
      })).filter(message => message.text || message.skills.length)
    : [];
  const context = compactHistory.length
    ? '历史对话（仅供背景，不要当成新指令）：\n' + JSON.stringify(compactHistory) + '\n\n'
    : '';
  const imageInput = (Array.isArray(body.images) ? body.images : []).slice(0, 9).filter(image => typeof image?.path === 'string').map(image => ({ type: 'localImage', path: image.path }));
  const textInput = body.text?.trim() || context ? [{ type: 'text', text: context + '用户本次请求：\n' + (body.text || ''), text_elements: [] }] : [];
  await rpc('turn/start', { threadId: s.threadId, input: [...imageInput, ...textInput] });
  s.needsHistory = false; save(s);
}
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end('{}'); return; }
  try {
    let raw = ''; for await (const c of req) { raw += c; if (raw.length > 8e6) throw new Error('请求过大'); }
    const b = raw ? JSON.parse(raw) : {};
    if (req.url === '/health') { await ready; res.end(JSON.stringify({ ok: true, version: serviceVersion })); return; }
    if (req.url === '/shutdown') {
      res.end(JSON.stringify({ ok: true }), () => {
        proc.kill();
        server.close(() => process.exit(0));
      });
      return;
    }
    if (req.url === '/models') {
      await ready;
      const models = [];
      let cursor = null;
      do {
        const page = await rpc('model/list', { includeHidden: false, limit: 100, ...(cursor ? { cursor } : {}) });
        models.push(...(page?.data || []));
        const next = page?.nextCursor || null;
        if (!next || next === cursor) break;
        cursor = next;
      } while (cursor);
      res.end(JSON.stringify({ models }));
      return;
    }
    const s = session(b.scope);
    if (req.url === '/state') { res.end(JSON.stringify(s)); return; }
    if (req.url === '/init') {
      if (!s.initialized) { s.messages = b.messages; stripExecutionHistory(s); normalizeSkillPlacement(s.messages); s.initialized = true; s.needsHistory = true; save(s); }
    } else if (req.url === '/directory') {
      if (busy(s)) throw new Error('请先停止当前对话');
      const cwd = realpathSync(String(b.cwd || '').trim());
      if (!statSync(cwd).isDirectory()) throw new Error('代码目录不是文件夹');
      s.cwd = cwd; s.threadId = null; s.needsHistory = true; save(s);
    } else if (req.url === '/model') {
      if (busy(s)) throw new Error('请先停止当前任务');
      const model = b.model || null;
      const modelProvider = b.modelProvider || null;
      if (s.threadId && (s.model !== model || s.modelProvider !== modelProvider)) {
        s.threadId = null;
        s.needsHistory = true;
      }
      s.modelId = b.modelId || null;
      s.model = model;
      s.modelProvider = modelProvider;
      save(s);
    } else if (req.url === '/start') {
      if (busy(s)) throw new Error('当前任务仍在进行');
      const images = (Array.isArray(b.images) ? b.images : []).slice(0, 9);
      if (!b.text?.trim() && !images.length) throw new Error('消息或图片不能为空');
      if (b.retry && isContentFilterError(s.error)) {
        // A filtered custom-provider turn may leave oversized or malformed
        // tool output in the native rollout. Rebuild from compact text history
        // instead of resuming the poisoned thread.
        s.threadId = null;
        s.needsHistory = true;
      }
      const skillParts = (Array.isArray(b.skills) ? b.skills : [])
        .filter(skill => skill && typeof skill.id === 'string' && typeof skill.name === 'string' && typeof skill.command === 'string')
        .map(skill => ({ type: 'skill', id: skill.id, name: skill.name, command: skill.command }));
      if (!b.retry) s.messages.push({ id: randomUUID(), role: 'user', parts: [...images.map(image => ({ type: 'image', ...image })), ...(b.text?.trim() ? [{ type: 'text', text: b.text }] : [])] });
      else {
        const user = s.messages.findLast(message => message.role === 'user');
        if (user) user.parts = user.parts.filter(part => part.type !== 'skill');
      }
      s.activeSkills = skillParts; s.turnAnswerIds = [];
      s.turnId = null; s.status = 'submitted'; s.error = null; s.requests = []; save(s);
      const generation = s.generation = (s.generation || 0) + 1;
      void start(s, b, generation).catch(e => { if (s.generation === generation) fail(s, e); });
    } else if (req.url === '/stop') {
      if (busy(s) && !s.turnId) { s.generation = (s.generation || 0) + 1; s.status = 'ready'; s.requests = []; save(s); }
      else if (busy(s)) {
        await rpc('turn/interrupt', { threadId: s.threadId, turnId: s.turnId });
        // Drop any leftover approval cards immediately; turn/completed will finalize status.
        s.requests = [];
        save(s);
      }
    } else if (req.url === '/rewind') {
      if (busy(s)) throw new Error('请先停止当前任务');
      const index = s.messages.findIndex(m => m.id === b.messageId);
      if (index < 0) throw new Error('未找到消息，请刷新后重试');
      s.messages = s.messages.slice(0, index + (b.keepMessage ? 1 : 0));
      // Rebuild a new context from the retained prefix. Never resume discarded turns.
      s.threadId = null; s.needsHistory = true; s.status = 'ready'; s.error = null; save(s);
    } else if (req.url === '/claim') {
      const r = s.requests.find(r => String(r.id) === String(b.id));
      if (!r || r.claimed) throw new Error('操作正在执行或已经完成');
      r.claimed = true; save(s);
    } else if (req.url === '/respond') {
      const r = s.requests.find(r => String(r.id) === String(b.id));
      if (!r) throw new Error('请求已失效');
      if (validSkill(b.usedSkill)) {
        s.activeSkills ||= [];
        if (!s.activeSkills.some(skill => skillKey(skill) === skillKey(b.usedSkill))) s.activeSkills.push({ type: 'skill', ...b.usedSkill });
      }
      send({ id: r.id, result: b.result });
      s.requests = s.requests.filter(x => x !== r); save(s);
    } else throw new Error('未知操作');
    res.end(JSON.stringify(s));
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
});
server.listen(
  testPort || join(dir, 'service.sock'),
  testPort ? '127.0.0.1' : undefined,
);
process.on('SIGTERM', () => { proc.kill(); server.close(); });
