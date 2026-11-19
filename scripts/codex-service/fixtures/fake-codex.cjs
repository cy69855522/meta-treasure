#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS script */
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = m => console.log(JSON.stringify(m));
let thread = 'thread', n = 0, starts = 0;
if (process.env.CODEX_HOME !== process.env.EXPECTED_CODEX_HOME) process.exit(2);
const done = () => send({ method: 'turn/completed', params: { threadId: thread, turn: { status: 'completed' } } });
const tool = (id, name, args, callId) => send({ id, method: 'item/tool/call', params: { threadId: thread, tool: name, callId, arguments: args } });
rl.on('line', line => {
  const m = JSON.parse(line), p = m.params || {};
  if (m.method === 'initialize') send({ id: m.id, result: {} });
  if (m.method === 'model/list') send({ id: m.id, result: { data: [{ model: 'catalog-model', displayName: 'Catalog Model', inputModalities: ['text'], isDefault: true }], nextCursor: null } });
  if (m.method === 'thread/start') {
    if (p.sandbox !== 'read-only' || p.approvalPolicy !== 'never') return send({ id: m.id, error: { message: 'not read only' } });
    thread = 'thread-' + (++n); starts++;
    send({ id: m.id, result: { thread: { id: thread } } });
  }
  if (m.method === 'thread/resume') send(p.threadId === 'thread-stale' ? { id: m.id, error: { message: 'no rollout' } } : { id: m.id, result: {} });
  if (m.method === 'turn/start') {
    send({ id: m.id, result: { turn: { id: 'turn' } } });
    send({ method: 'turn/started', params: { threadId: thread, turn: { id: 'turn' } } });
    const text = p.input.find(i => i.type === 'text')?.text || '';
    if (text.endsWith('approve')) tool(900, 'createTask', { title: 'task' });
    else if (text.endsWith('search')) tool(901, 'webSearch', { query: 'q' }, 'call-1');
    else if (text.endsWith('blank')) tool(902, 'webSearch', { query: 'q' }, 'call-2');
    else if (text.endsWith('reconnect')) {
      for (let i = 1; i <= 3; i++) send({ method: 'error', params: { threadId: thread, willRetry: true, error: { message: 'Reconnecting... ' + i + '/5' } } });
      send({ method: 'item/agentMessage/delta', params: { threadId: thread, itemId: 'answer-' + n, delta: 'RECOVERED' } });
      done();
    } else if (text.endsWith('leak')) {
      send({ method: 'item/agentMessage/delta', params: { threadId: thread, itemId: 'answer-' + n, delta: 'itemssearchId' } });
      send({ method: 'item/completed', params: { threadId: thread, item: { id: 'answer-' + n, type: 'agentMessage', text: 'itemssearchId' } } });
      done();
    } else if (text.endsWith('hang')) {
      /* never completes: lets the test stop mid-turn */
    } else {
      send({ method: 'item/agentMessage/delta', params: { threadId: thread, itemId: 'answer-' + n, delta: p.input.some(i => i.type === 'localImage') ? 'IMAGE' : 'OK:' + p.threadId + ':' + starts } });
      send({ method: 'item/started', params: { threadId: thread, item: { id: 'hidden', type: 'commandExecution', command: 'rg src' } } });
      send({ method: 'turn/diff/updated', params: { threadId: thread, diff: '+hidden' } });
      done();
    }
  }
  if (m.method === 'turn/interrupt') { send({ id: m.id, result: {} }); send({ method: 'turn/completed', params: { threadId: thread, turn: { status: 'interrupted' } } }); }
  if ((m.id === 900 || m.id === 901) && m.result) {
    const itemId = 'conclusion-' + n;
    send({ method: 'item/completed', params: { threadId: thread, item: { id: itemId, type: 'agentMessage', text: '结论' } } });
    done();
  }
  if (m.id === 902 && m.result) {
    // the real failure: the model finishes the turn with an empty message after its tool ran
    send({ method: 'item/completed', params: { threadId: thread, item: { id: 'blank-' + n, type: 'agentMessage', text: '' } } });
    done();
  }
});
