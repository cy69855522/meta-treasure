import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeLine } from './app-server.mjs';
import { claimRequest, isClaimed, requestView } from './approvals.mjs';
import { REQUEST_LEASE_MS } from './config.mjs';
import { applyPresentation, closeDanglingSearches, compactHistory } from './messages.mjs';
import { applyNotification } from './turn-events.mjs';
import { EMPTY_REPLY, LEAKED_REPLY, isLeakedToolArgumentText, poisonsThread, readableError } from './sanitize.mjs';
import { buildTurnInput, ensureThread, reconcileRetry, reconcileThread } from './threads.mjs';

const session = (extra = {}) => ({
  scope: 'steward', messages: [], requests: [], status: 'ready',
  threadId: 'thread-1', model: 'm', modelProvider: 'p', ...extra,
});

test('claim is a lease: one winner, expiry frees it', () => {
  const s = session({ requests: [{ id: 1, method: 'item/tool/call', params: {} }] });
  const t0 = 1_000_000;
  assert.ok(claimRequest(s, 1, t0));
  assert.equal(claimRequest(s, 1, t0 + 10), null);
  assert.equal(requestView(s.requests[0], t0 + 10).claimed, true);
  assert.equal(isClaimed(s.requests[0], t0 + REQUEST_LEASE_MS + 1), false);
  assert.ok(claimRequest(s, 1, t0 + REQUEST_LEASE_MS + 1), 'a dead owner stops blocking');
  assert.equal(claimRequest(s, 'missing', t0), null);
});

test('request ids compare as strings', () => {
  const s = session({ requests: [{ id: 7, method: 'item/tool/call', params: {} }] });
  assert.ok(claimRequest(s, '7'));
});

test('thread reset rules', () => {
  // model change invalidates, same model does not
  let s = session();
  reconcileThread(s, { model: 'm', modelProvider: 'p' });
  assert.equal(s.threadId, 'thread-1');
  reconcileThread(s, { model: 'other', modelProvider: 'p' });
  assert.equal(s.threadId, null);
  assert.equal(s.threadResetReason, 'model-changed');
  assert.equal(s.needsHistory, true);

  // library / tools keys: omitted keys never invalidate
  s = session({ libraryKey: 'a', toolsKey: 't1' });
  reconcileThread(s, { model: 'm', modelProvider: 'p', libraryKey: '', toolsKey: '' });
  assert.equal(s.threadId, 'thread-1');
  reconcileThread(s, { model: 'm', modelProvider: 'p', libraryKey: 'b', toolsKey: 't1' });
  assert.equal(s.threadId, null);
  assert.equal(s.libraryKey, 'b');
  s = session({ toolsKey: 't1' });
  reconcileThread(s, { model: 'm', modelProvider: 'p', toolsKey: 't2' });
  assert.equal(s.threadResetReason, 'tools-changed');

  // /model style call touches nothing else
  s = session({ libraryKey: 'a' });
  reconcileThread(s, { model: 'm', modelProvider: 'p' });
  assert.equal(s.libraryKey, 'a');
  assert.equal(s.threadId, 'thread-1');
});

test('retry only discards the thread after a poisoning failure', () => {
  let s = session({ error: '连接超时' });
  reconcileRetry(s, true);
  assert.equal(s.threadId, 'thread-1');
  s = session({ error: readableError(new Error('content_filter')) });
  reconcileRetry(s, false);
  assert.equal(s.threadId, 'thread-1');
  reconcileRetry(s, true);
  assert.equal(s.threadId, null);
  s = session({ error: LEAKED_REPLY });
  reconcileRetry(s, true);
  assert.equal(s.threadResetReason, 'poisoned-reply');
});

test('ensureThread falls back to a fresh thread when resume fails', async () => {
  const calls = [];
  const rpc = async method => {
    calls.push(method);
    if (method === 'thread/resume') throw new Error('Codex thread/resume 请求超时');
    return { thread: { id: 'thread-2' } };
  };
  const s = session();
  const ok = await ensureThread({ s, config: {}, tools: [], rpc, save: () => {}, isStale: () => false });
  assert.equal(ok, true);
  assert.deepEqual(calls, ['thread/resume', 'thread/start']);
  assert.equal(s.threadId, 'thread-2');
  assert.equal(s.threadResetReason, 'resume-failed');
});

test('ensureThread stops quietly when the turn was superseded', async () => {
  const s = session({ threadId: null });
  const ok = await ensureThread({
    s, config: {}, tools: [], save: () => {}, isStale: () => true,
    rpc: async () => ({ thread: { id: 'late' } }),
  });
  assert.equal(ok, false);
  assert.equal(s.threadId, null);
});

test('turn input only carries history when the thread was rebuilt', () => {
  const messages = [
    { role: 'user', parts: [{ type: 'text', text: 'old question' }] },
    { role: 'assistant', parts: [{ type: 'skill', name: 'diagnose' }, { type: 'text', text: 'old answer' }] },
    { role: 'user', parts: [{ type: 'text', text: 'new' }] },
  ];
  const fresh = buildTurnInput(session({ messages, needsHistory: false }), { text: 'new' });
  assert.equal(fresh[0].text, '用户本次请求：\nnew');
  const rebuilt = buildTurnInput(session({ messages, needsHistory: true }), { text: 'new' });
  assert.match(rebuilt[0].text, /old answer/);
  assert.equal(compactHistory(messages).length, 2, 'the pending user message is not history');
});

test('leaked tool-argument detection is strict', () => {
  assert.equal(isLeakedToolArgumentText('itemssearchId'), true);
  assert.equal(isLeakedToolArgumentText('query'), false, 'a single word is a legitimate answer');
  assert.equal(isLeakedToolArgumentText('items searchId'), false);
  assert.equal(isLeakedToolArgumentText('今天的搜索结果'), false);
  assert.equal(poisonsThread('模型服务因内容过滤中断了本轮输出，可点击重试。'), true);
  assert.equal(poisonsThread('网络错误'), false);
});

test('presentation merges begin and done into one search part', () => {
  const s = session({ turnMessageId: null, activeSkills: [], activeRules: [], activeSearches: [] });
  applyPresentation(s, { search: { id: 'call-1', query: 'q', status: 'searching' } }, { callId: 'call-1', final: false });
  assert.equal(s.activeSearches.length, 0, 'progress is not persisted as a used search');
  applyPresentation(s, { search: { id: 'search-1', hits: [{ id: 'a', url: 'u' }] } }, { callId: 'call-1', final: true });
  const parts = s.messages.at(-1).parts.filter(p => p.type === 'search');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].status, 'done');
  assert.equal(s.activeSearches.length, 1);
  // junk presentation is ignored
  applyPresentation(s, { search: { id: 5 }, skill: { id: 1 } }, { callId: 'x', final: true });
  applyPresentation(s, null, { callId: 'x', final: true });
  assert.equal(s.messages.at(-1).parts.filter(p => p.type === 'search').length, 1);
});

test('dangling progress bars are closed', () => {
  const message = { parts: [
    { type: 'search', id: 'a', status: 'fetching' },
    { type: 'search', id: 'b', status: 'done' },
    { type: 'text', text: 'x' },
  ] };
  closeDanglingSearches(message);
  assert.equal(message.parts[0].status, 'error');
  assert.equal(message.parts[1].status, 'done');
});

test('rpc lines never carry a lone surrogate (the app-server drops those silently)', () => {
  const cut = '🏆'.slice(0, 1); // an emoji sliced in half
  const line = serializeLine({ id: 1, params: { developerInstructions: `a${cut}…`, ok: '👑 完整' } });
  assert.ok(line.endsWith('\n'));
  assert.doesNotMatch(line, /\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])/i);
  const parsed = JSON.parse(line);
  assert.equal(parsed.params.developerInstructions, 'a\uFFFD…');
  assert.equal(parsed.params.ok, '👑 完整');
});

function finished(parts, status = 'completed') {
  const s = session({
    status: 'streaming',
    turnMessageId: 'a1',
    activeSkills: [],
    activeRules: [],
    activeSearches: [],
    requests: [],
    messages: [{ id: 'a1', role: 'assistant', parts }],
  });
  applyNotification(s, { method: 'turn/completed', params: { turn: { status } } });
  return s;
}

test('a turn that ends without a final answer is an error, not a blank success', () => {
  const search = { type: 'search', id: 's', status: 'done' };
  // the real failure: intro text, tools ran, then an empty message
  const blank = finished([{ type: 'text', text: '我先为你检索…' }, search, { type: 'text', text: '' }]);
  assert.equal(blank.status, 'error');
  assert.equal(blank.error, EMPTY_REPLY);
  assert.ok(poisonsThread(blank.error), 'retry must rebuild the thread');
  // tools ran and nothing was said afterwards
  assert.equal(finished([{ type: 'text', text: '先搜一下' }, search]).error, EMPTY_REPLY);
  // no assistant output at all
  assert.equal(finished([{ type: 'skill', id: 'k' }]).error, EMPTY_REPLY);
});

test('a turn with a final answer, or one the user stopped, stays ready', () => {
  const search = { type: 'search', id: 's', status: 'done' };
  const ok = finished([{ type: 'text', text: '先搜' }, search, { type: 'text', text: '结论：不支持' }]);
  assert.equal(ok.status, 'ready');
  assert.equal(ok.error, null);
  assert.equal(finished([{ type: 'text', text: '' }], 'interrupted').status, 'ready');
});
