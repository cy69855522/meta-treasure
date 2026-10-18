import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const root = process.cwd();
const serviceVersion = 31;
const COMPLETE_TURN_TIMEOUT_MS = Number(process.env.DEEP_RADAR_CODEX_TURN_MS) || 900_000;
const WORKSPACE_TURN_TIMEOUT_MS = Number(process.env.DEEP_RADAR_CODEX_WORKSPACE_MS) || 300_000;
const ERROR_RETRY_IDLE_MS = Number(process.env.DEEP_RADAR_CODEX_ERROR_IDLE_MS) || 90_000;
const KEEPALIVE_MS = Number(process.env.DEEP_RADAR_CODEX_KEEPALIVE_MS) || 20_000;
const FATAL_PROVIDER_RE =
  /unsupported_country|request_forbidden|invalid.?api.?key|incorrect.?api.?key|401|403|region.?not.?supported|territory.?not.?supported/i;
const testPort = process.env.PROGRESS_CODEX_TEST_PORT
  ? Number(process.env.PROGRESS_CODEX_TEST_PORT)
  : null;
const dir = process.env.PROGRESS_CODEX_STATE_DIR || join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'progress-codex');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const progressCodexHome = process.env.PROGRESS_CODEX_HOME || join(homedir(), '.progress', 'codex');
mkdirSync(progressCodexHome, { recursive: true, mode: 0o700 });
const deepRadarWorkspace = join(progressCodexHome, 'workspace');
mkdirSync(deepRadarWorkspace, { recursive: true, mode: 0o700 });
const token = readFileSync(join(dir, 'token'), 'utf8').trim();

const sessions = new Map();
const pending = new Map();
const directTurns = new Map();
let sequence = 0;
function childEnvironment(extra = {}) {
  const env = {
    ...process.env,
    ...extra,
    CODEX_HOME: progressCodexHome,
    // bboluo.com / bboluo proxy 需要走 Clash Verge
    http_proxy: 'http://127.0.0.1:7897',
    https_proxy: 'http://127.0.0.1:7897',
    no_proxy: 'localhost,127.0.0.1,::1,.local',
  };
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
const validRule = rule => rule && typeof rule.id === 'string' && typeof rule.name === 'string';
const validSearch = search =>
  search &&
  typeof search.id === 'string' &&
  (
    (typeof search.query === 'string' && Array.isArray(search.hits)) ||
    (Array.isArray(search.pages) && search.pages.length > 0)
  );
const skillKey = skill => skill.id || skill.command;
const ruleKey = rule => rule.id || rule.name;
const searchKey = search => search.id;
function mergeSkills(message, skills) {
  if (!message || !Array.isArray(message.parts)) return;
  const merged = new Map();
  for (const skill of [...message.parts.filter(part => part.type === 'skill'), ...skills].filter(validSkill)) {
    merged.set(skillKey(skill), { type: 'skill', id: skill.id, name: skill.name, command: skill.command, ...(skill.description ? { description: skill.description } : {}) });
  }
  message.parts = [...merged.values(), ...message.parts.filter(part => part.type !== 'skill')];
}
function mergeRules(message, rules) {
  if (!message || !Array.isArray(message.parts)) return;
  const merged = new Map();
  for (const rule of [...message.parts.filter(part => part.type === 'rule'), ...rules].filter(validRule)) {
    merged.set(ruleKey(rule), { type: 'rule', id: rule.id, name: rule.name, ...(rule.description ? { description: rule.description } : {}) });
  }
  message.parts = [...message.parts.filter(part => part.type === 'skill'), ...merged.values(), ...message.parts.filter(part => part.type !== 'skill' && part.type !== 'rule')];
}
function mergeSearches(message, searches) {
  if (!message || !Array.isArray(message.parts)) return;
  for (const search of searches || []) {
    if (!search || typeof search.id !== 'string') continue;
    upsertInlineSearch(message, {
      id: search.id,
      query: typeof search.query === 'string' ? search.query : '',
      sources: Array.isArray(search.sources) ? search.sources : [],
      hits: Array.isArray(search.hits) ? search.hits : [],
      pages: Array.isArray(search.pages) ? search.pages : [],
      status: search.status || ((search.hits?.length || search.pages?.length) ? 'done' : 'searching'),
      phase: search.phase || (search.pages?.length ? 'fetch' : 'search'),
      ...(search.callId ? { callId: search.callId } : {}),
      ...(search.error ? { error: search.error } : {}),
    });
  }
}
function normalizeSkillPlacement(messages) {
  let pendingSkills = [];
  let pendingRules = [];
  for (const message of messages) {
    const ownSkills = (message.parts || []).filter(part => part.type === 'skill' && validSkill(part));
    const ownRules = (message.parts || []).filter(part => part.type === 'rule' && validRule(part));
    if (message.role === 'user' && (ownSkills.length || ownRules.length)) {
      pendingSkills = ownSkills;
      pendingRules = ownRules;
      message.parts = message.parts.filter(part => part.type !== 'skill' && part.type !== 'rule');
    } else if (message.role === 'assistant' && (message.parts || []).some(part => part.type === 'text')) {
      if (pendingSkills.length) mergeSkills(message, pendingSkills);
      if (pendingRules.length) mergeRules(message, pendingRules);
      pendingSkills = [];
      pendingRules = [];
    }
  }
}
function ensureTurnAssistantMessage(s) {
  if (s.turnMessageId) {
    const existing = s.messages.find(message => message.id === s.turnMessageId);
    if (existing) return existing;
  }
  const id = randomUUID();
  s.turnMessageId = id;
  const message = { id, role: 'assistant', parts: [] };
  mergeSkills(message, s.activeSkills || []);
  mergeRules(message, s.activeRules || []);
  s.messages.push(message);
  s.turnAnswerIds = [id];
  return message;
}

function textPartIndexForItem(s, message, itemId) {
  s.turnTextByItem ||= {};
  if (s.turnTextByItem[itemId] != null && message.parts[s.turnTextByItem[itemId]]?.type === 'text') {
    return s.turnTextByItem[itemId];
  }
  message.parts.push({ type: 'text', text: '' });
  const index = message.parts.length - 1;
  s.turnTextByItem[itemId] = index;
  return index;
}

function upsertInlineSearch(message, search) {
  if (!message || !search?.id) return;
  message.parts ||= [];
  const byCall = search.callId
    ? message.parts.findIndex(part => part.type === 'search' && part.callId === search.callId)
    : -1;
  const byId = message.parts.findIndex(part => part.type === 'search' && part.id === search.id);
  const idx = byCall >= 0 ? byCall : byId;
  if (idx >= 0) {
    const prev = message.parts[idx];
    const hitMap = new Map((prev.hits || []).map(hit => [hit.url || hit.id, hit]));
    for (const hit of search.hits || []) hitMap.set(hit.url || hit.id, hit);
    const pageMap = new Map((prev.pages || []).map(page => [page.url, page]));
    for (const page of search.pages || []) pageMap.set(page.url, page);
    message.parts[idx] = {
      ...prev,
      ...search,
      type: 'search',
      query: search.query || prev.query || '',
      sources: [...new Set([...(prev.sources || []), ...(search.sources || [])])],
      hits: [...hitMap.values()],
      pages: [...pageMap.values()],
    };
    return;
  }
  message.parts.push({
    type: 'search',
    id: search.id,
    query: search.query || '',
    sources: Array.isArray(search.sources) ? search.sources : [],
    hits: Array.isArray(search.hits) ? search.hits : [],
    pages: Array.isArray(search.pages) ? search.pages : [],
    status: search.status || 'searching',
    phase: search.phase || 'search',
    ...(search.callId ? { callId: search.callId } : {}),
    ...(search.error ? { error: search.error } : {}),
  });
}

function upsertInlineRadar(message, radar) {
  if (!message || typeof radar?.sessionId !== 'string' || !radar.sessionId) return;
  message.parts ||= [];
  const part = {
    type: 'radar',
    sessionId: radar.sessionId,
    title: typeof radar.title === 'string' ? radar.title : '',
    url: typeof radar.url === 'string' ? radar.url : '',
    reportUrl: typeof radar.reportUrl === 'string' ? radar.reportUrl : '',
  };
  const idx = message.parts.findIndex(item => item.type === 'radar' && item.sessionId === part.sessionId);
  if (idx >= 0) message.parts[idx] = { ...message.parts[idx], ...part };
  else message.parts.push(part);
}

const INLINE_SEARCH_TOOLS = ['webSearch', 'fetchPages', 'fetchUrl'];

function urlHosts(urls) {
  if (!Array.isArray(urls)) return [];
  const hosts = urls.map(url => {
    try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(String(url)) ? String(url) : `https://${url}`).hostname; }
    catch { return ''; }
  });
  return [...new Set(hosts.filter(Boolean))];
}

function beginInlineToolSearch(s, request) {
  const tool = String(request?.params?.tool || '');
  if (!INLINE_SEARCH_TOOLS.includes(tool)) return;
  const args = request.params?.arguments && typeof request.params.arguments === 'object'
    ? request.params.arguments
    : {};
  const callId = String(request.params?.callId || request.id);
  const message = ensureTurnAssistantMessage(s);
  if (tool === 'fetchUrl') {
    upsertInlineSearch(message, {
      id: callId,
      callId,
      query: '',
      sources: urlHosts(args.urls),
      hits: [],
      pages: [],
      status: 'fetching',
      phase: 'visit',
    });
  } else if (tool === 'webSearch') {
    upsertInlineSearch(message, {
      id: callId,
      callId,
      query: typeof args.query === 'string' ? args.query : '',
      sources: Array.isArray(args.sources) ? args.sources.filter(source => typeof source === 'string') : [],
      hits: [],
      pages: [],
      status: 'searching',
      phase: 'search',
    });
  } else {
    upsertInlineSearch(message, {
      id: typeof args.searchId === 'string' && args.searchId ? args.searchId : callId,
      callId,
      query: '',
      sources: [],
      hits: [],
      pages: [],
      status: 'fetching',
      phase: 'fetch',
    });
  }
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
    s.requests = []; s.activeSkills = []; s.activeRules = []; s.activeSearches = []; s.turnAnswerIds = []; s.turnMessageId = null; s.turnTextByItem = {};
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
  s.activeSkills = []; s.activeRules = []; s.activeSearches = [];
  s.turnMessageId = null; s.turnTextByItem = {};
  save(s);
}
createInterface({ input: proc.stdout }).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!msg.method && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); return;
  }
  const p = msg.params || {};
  const direct = p.threadId ? directTurns.get(p.threadId) : undefined;
  if (direct) {
    const method = String(msg.method || '');
    direct.lastEvent = method;
    direct.lastEventAt = Date.now();
    if (msg.id !== undefined) {
      send({ id: msg.id, error: { code: -32601, message: 'Unsupported client request' } });
      return;
    }
    if (method !== 'turn/completed' && method !== 'error') {
      direct.arm?.(direct.baseIdleMs);
    }
    if (method === 'item/agentMessage/delta') {
      direct.textByItem.set(
        p.itemId,
        (direct.textByItem.get(p.itemId) || '') + (p.delta || ''),
      );
    } else if (method === 'item/completed' && p.item?.type === 'agentMessage') {
      direct.textByItem.set(p.item.id, p.item.text || '');
    } else if (method === 'turn/started') {
      direct.turnId = p.turn?.id || direct.turnId;
      if (direct.interruptRequested && direct.turnId) {
        void rpc('turn/interrupt', {
          threadId: p.threadId,
          turnId: direct.turnId,
        }).catch(() => direct.reject(new Error('已停止')));
      }
    } else if (method === 'turn/completed') {
      const status = String(p.turn?.status || '');
      const error = p.turn?.error?.message;
      if (
        direct.interruptRequested ||
        status === 'interrupted' ||
        status === 'cancelled'
      ) {
        direct.reject(new Error('已停止'));
      } else if (error || status === 'failed') {
        direct.reject(new Error(error || 'Codex 执行失败'));
      } else {
        direct.resolve([...direct.textByItem.values()].join(''));
      }
    } else if (method === 'error') {
      const error = String(
        p.error?.message || p.message || p.error || 'Codex 执行失败',
      );
      direct.lastError = error;
      if (FATAL_PROVIDER_RE.test(error) || !p.willRetry) {
        direct.reject(new Error(error));
      } else {
        // The app-server owns provider retries (for example, 3/5 still has
        // two recovery attempts left). Keep waiting while it says willRetry;
        // the idle and wall-clock timers remain our safety net.
        direct.arm?.(ERROR_RETRY_IDLE_MS);
      }
    }
    return;
  }
  const s = [...sessions.values()].find(s => s.threadId === p.threadId);
  if (!s) { if (msg.id !== undefined) send({ id: msg.id, error: { code: -32601, message: 'Unknown thread' } }); return; }
  if (msg.id !== undefined) {
    const supported = ['item/tool/call', 'item/tool/requestUserInput'];
    if (!supported.includes(msg.method)) { send({ id: msg.id, error: { code: -32601, message: 'Unsupported client request' } }); return; }
    const request = { id: msg.id, method: msg.method, params: p };
    s.requests.push(request);
    if (msg.method === 'item/tool/call') beginInlineToolSearch(s, request);
  } else if (msg.method === 'serverRequest/resolved') {
    s.requests = s.requests.filter(r => String(r.id) !== String(p.requestId));
  } else if (msg.method === 'turn/started') {
    s.turnId = p.turn.id;
    s.status = 'streaming';
    s.turnMessageId = null;
    s.turnTextByItem = {};
    s.turnAnswerIds = [];
    s.activeSearches = [];
  } else if (msg.method === 'item/agentMessage/delta') {
    const m = ensureTurnAssistantMessage(s);
    const index = textPartIndexForItem(s, m, p.itemId);
    m.parts[index].text += p.delta;
  } else if (msg.method === 'item/completed' && p.item?.type === 'agentMessage') {
    const m = ensureTurnAssistantMessage(s);
    const index = textPartIndexForItem(s, m, p.item.id);
    m.parts[index].text = p.item.text || '';
  } else if (msg.method === 'turn/completed') {
    const turnMessage = s.turnMessageId
      ? s.messages.find(message => message.id === s.turnMessageId)
      : s.messages.find(message => message.id === (s.turnAnswerIds || []).at(-1));
    if (turnMessage) {
      mergeSkills(turnMessage, s.activeSkills || []);
      mergeRules(turnMessage, s.activeRules || []);
      mergeSearches(turnMessage, s.activeSearches || []);
    }
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
    s.requests = []; s.activeSkills = []; s.activeRules = []; s.activeSearches = [];
    s.turnMessageId = null; s.turnTextByItem = {};
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
  const libraryKey = typeof body.libraryKey === 'string' ? body.libraryKey : '';
  if (libraryKey && s.libraryKey !== libraryKey) {
    s.threadId = null;
    s.needsHistory = true;
    s.libraryKey = libraryKey;
  }
  const toolsKey = typeof body.toolsKey === 'string' ? body.toolsKey : '';
  if (toolsKey && s.toolsKey !== toolsKey) {
    s.threadId = null;
    s.needsHistory = true;
  }
  if (toolsKey) s.toolsKey = toolsKey;
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
  const turnPrefix = typeof body.turnLibraryPrefix === 'string' && body.turnLibraryPrefix.trim()
    ? body.turnLibraryPrefix.trim() + '\n\n'
    : '';
  const imageInput = (Array.isArray(body.images) ? body.images : []).slice(0, 9).filter(image => typeof image?.path === 'string').map(image => ({ type: 'localImage', path: image.path }));
  const textInput = body.text?.trim() || context || turnPrefix ? [{ type: 'text', text: turnPrefix + context + '用户本次请求：\n' + (body.text || ''), text_elements: [] }] : [];
  await rpc('turn/start', { threadId: s.threadId, input: [...imageInput, ...textInput] });
  s.needsHistory = false; save(s);
}

function waitDirectTurn(threadId, timeoutMs, label) {
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
          waiter.reject(
            new Error(
              `Codex 生成超时：${label}（${Math.round(nextIdleMs / 1000)} 秒无进度；最后事件 ${waiter.lastEvent || '无'}${detail}）`,
            ),
          );
        }, nextIdleMs);
      },
    };
    const settle = (error, value) => {
      if (waiter.done || !directTurns.has(threadId)) return;
      waiter.done = true;
      directTurns.delete(threadId);
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
    directTurns.set(threadId, waiter);
    waiter.arm(timeoutMs);
  });
}

function directImageInput(body) {
  return (Array.isArray(body.images) ? body.images : [])
    .slice(0, 9)
    .filter(image => typeof image?.path === 'string')
    .map(image => ({ type: 'localImage', path: image.path }));
}

function directThreadConfig(body, cwd, sandbox) {
  return {
    cwd,
    sandbox,
    approvalPolicy: 'never',
    developerInstructions: String(body.instructions || ''),
    ...(body.model ? { model: body.model } : {}),
    ...(body.modelProvider ? { modelProvider: body.modelProvider } : {}),
  };
}

async function startDirectThread(body, cwd, sandbox) {
  const started = await rpc(
    'thread/start',
    directThreadConfig(body, cwd, sandbox),
  );
  return started.thread.id;
}

async function runDirectTurn(threadId, body, timeoutMs, label) {
  const text = String(body.text || '');
  if (!text.trim()) throw new Error('prompt 为空');
  const waiting = waitDirectTurn(threadId, timeoutMs, label);
  try {
    await rpc('turn/start', {
      threadId,
      input: [
        ...directImageInput(body),
        { type: 'text', text, text_elements: [] },
      ],
    });
  } catch (error) {
    directTurns.get(threadId)?.reject(error);
  }
  return waiting;
}

function assertReportCwd(cwd) {
  const root = resolve(tmpdir(), 'deep-radar-reports');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const absolute = resolve(String(cwd || ''));
  if (!existsSync(absolute)) throw new Error('工作区不存在');
  const real = realpathSync(absolute);
  const realRoot = realpathSync(root);
  const rel = relative(realRoot, real);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error('工作区路径不合法');
  }
  return real;
}

function interruptDirectThread(threadId) {
  const waiter = directTurns.get(threadId);
  if (!waiter || waiter.done) return;
  waiter.interruptRequested = true;
  if (!waiter.turnId) return;
  void rpc('turn/interrupt', { threadId, turnId: waiter.turnId }).catch(() => {
    waiter.reject(new Error('已停止'));
  });
}

function watchDirectAbort(req, res, getThreadId) {
  const stop = () => {
    const threadId = getThreadId();
    if (threadId) interruptDirectThread(threadId);
  };
  req.on('aborted', stop);
  res.on('close', () => {
    if (!res.writableEnded) stop();
  });
}

function writeNdjson(res, value) {
  res.write(`${JSON.stringify(value)}\n`);
}

async function streamLongJob(res, work) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  const ping = setInterval(() => {
    try {
      writeNdjson(res, { t: 'ping', at: Date.now() });
    } catch {
      // Client disconnected.
    }
  }, KEEPALIVE_MS);
  try {
    writeNdjson(res, { t: 'ok', ...(await work()) });
  } catch (error) {
    writeNdjson(res, {
      t: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearInterval(ping);
    res.end();
  }
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
    if (req.url === '/complete') {
      let threadId = '';
      watchDirectAbort(req, res, () => threadId);
      await streamLongJob(res, async () => {
        await ready;
        threadId = await startDirectThread(
          b,
          deepRadarWorkspace,
          'read-only',
        );
        if (req.aborted) interruptDirectThread(threadId);
        const text = await runDirectTurn(
          threadId,
          b,
          COMPLETE_TURN_TIMEOUT_MS,
          'deep-radar-complete',
        );
        return { text };
      });
      return;
    }
    if (req.url === '/workspace') {
      let threadId = typeof b.threadId === 'string' ? b.threadId : '';
      watchDirectAbort(req, res, () => threadId);
      await streamLongJob(res, async () => {
        await ready;
        const cwd = assertReportCwd(b.cwd);
        if (threadId) {
          await rpc('thread/resume', {
            ...directThreadConfig(b, cwd, 'workspace-write'),
            threadId,
          });
        } else {
          threadId = await startDirectThread(b, cwd, 'workspace-write');
        }
        if (req.aborted) interruptDirectThread(threadId);
        const text = await runDirectTurn(
          threadId,
          b,
          WORKSPACE_TURN_TIMEOUT_MS,
          'deep-radar-workspace',
        );
        return { text, threadId };
      });
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
        .map(skill => ({ type: 'skill', id: skill.id, name: skill.name, command: skill.command, ...(skill.description ? { description: skill.description } : {}) }));
      const ruleParts = (Array.isArray(b.rules) ? b.rules : [])
        .filter(rule => rule && typeof rule.id === 'string' && typeof rule.name === 'string')
        .map(rule => ({ type: 'rule', id: rule.id, name: rule.name, ...(rule.description ? { description: rule.description } : {}) }));
      if (!b.retry) s.messages.push({ id: randomUUID(), role: 'user', parts: [...images.map(image => ({ type: 'image', ...image })), ...(b.text?.trim() ? [{ type: 'text', text: b.text }] : [])] });
      else {
        const user = s.messages.findLast(message => message.role === 'user');
        if (user) user.parts = user.parts.filter(part => part.type !== 'skill' && part.type !== 'rule');
      }
      s.activeSkills = skillParts; s.activeRules = ruleParts; s.activeSearches = []; s.turnAnswerIds = [];
      s.turnMessageId = null; s.turnTextByItem = {};
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
      if (validRule(b.usedRule)) {
        s.activeRules ||= [];
        if (!s.activeRules.some(rule => ruleKey(rule) === ruleKey(b.usedRule))) s.activeRules.push({ type: 'rule', ...b.usedRule });
      }
      if (validSearch(b.usedSearch) || (b.usedSearch && typeof b.usedSearch.id === 'string' && Array.isArray(b.usedSearch.pages))) {
        s.activeSearches ||= [];
        const callId = String(r.params?.callId || r.id);
        const incoming = {
          type: 'search',
          id: b.usedSearch.id,
          callId,
          query: typeof b.usedSearch.query === 'string' ? b.usedSearch.query : '',
          sources: Array.isArray(b.usedSearch.sources) ? b.usedSearch.sources : [],
          hits: Array.isArray(b.usedSearch.hits) ? b.usedSearch.hits : [],
          pages: Array.isArray(b.usedSearch.pages) ? b.usedSearch.pages : [],
          status: 'done',
          phase: b.usedSearch.phase === 'visit'
            ? 'visit'
            : Array.isArray(b.usedSearch.pages) && b.usedSearch.pages.length ? 'fetch' : 'search',
        };
        const idx = s.activeSearches.findIndex(search => searchKey(search) === searchKey(incoming) || search.callId === callId);
        if (idx < 0) {
          if (validSearch(incoming) || incoming.pages.length) s.activeSearches.push(incoming);
        } else {
          const prev = s.activeSearches[idx];
          const hitMap = new Map((prev.hits || []).map(hit => [hit.url || hit.id, hit]));
          for (const hit of incoming.hits) hitMap.set(hit.url || hit.id, hit);
          const pageMap = new Map((prev.pages || []).map(page => [page.url, page]));
          for (const page of incoming.pages) pageMap.set(page.url, page);
          s.activeSearches[idx] = {
            ...prev,
            ...incoming,
            query: incoming.query || prev.query,
            sources: [...new Set([...(prev.sources || []), ...(incoming.sources || [])])],
            hits: [...hitMap.values()],
            pages: [...pageMap.values()],
          };
        }
        const turnMessage = ensureTurnAssistantMessage(s);
        upsertInlineSearch(turnMessage, incoming);
      } else if (r.method === 'item/tool/call' && INLINE_SEARCH_TOOLS.includes(String(r.params?.tool || ''))) {
        // Always close the inline status bar even when the tool payload lacked usedSearch.
        const callId = String(r.params?.callId || r.id);
        const turnMessage = ensureTurnAssistantMessage(s);
        const success = b.result && typeof b.result === 'object' ? b.result.success !== false : true;
        const tool = String(r.params?.tool || '');
        const args = r.params?.arguments && typeof r.params.arguments === 'object' ? r.params.arguments : {};
        upsertInlineSearch(turnMessage, {
          id: tool === 'fetchPages' && typeof args.searchId === 'string' && args.searchId
            ? args.searchId
            : callId,
          callId,
          query: typeof args.query === 'string' ? args.query : '',
          sources: tool === 'fetchUrl'
            ? urlHosts(args.urls)
            : Array.isArray(args.sources) ? args.sources.filter(source => typeof source === 'string') : [],
          hits: [],
          pages: [],
          status: success ? 'done' : 'error',
          phase: tool === 'fetchUrl' ? 'visit' : tool === 'fetchPages' ? 'fetch' : 'search',
          ...(success ? {} : { error: '执行失败' }),
        });
      }
      if (b.usedRadar && typeof b.usedRadar.sessionId === 'string' && b.usedRadar.sessionId) {
        upsertInlineRadar(ensureTurnAssistantMessage(s), b.usedRadar);
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
