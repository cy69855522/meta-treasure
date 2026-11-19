import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

const delay = ms => new Promise(r => setTimeout(r, ms));
const { version: expectedVersion } = JSON.parse(
  await readFile(resolve('scripts/codex-service/version.json'), 'utf8'),
);

/** A scripted stand-in for `codex app-server`; the prompt's last word picks the behaviour. */
const FAKE_CODEX = await readFile(resolve('scripts/codex-service/fixtures/fake-codex.cjs'), 'utf8');

async function withService(run) {
  const dir = await mkdtemp(resolve('.codex-service-test-'));
  const fake = join(dir, 'codex');
  await writeFile(join(dir, 'token'), 'test-token');
  await writeFile(fake, FAKE_CODEX);
  await chmod(fake, 0o700);
  const scope = '00000000-0000-4000-8000-000000000002';
  const port = 38000 + ((process.pid + Math.floor(Math.random() * 500)) % 1000);
  let child;

  const call = (action, body = {}) => new Promise((resolveCall, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/' + action, method: 'POST', headers: { Authorization: 'Bearer test-token' } },
      res => {
        let text = '';
        res.on('data', d => (text += d));
        res.on('end', () => resolveCall(JSON.parse(text)));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify({ scope, ...body }));
  });

  async function launch() {
    const codexHome = join(dir, 'codex-home');
    child = spawn(process.execPath, [resolve('scripts/codex-service.mjs')], {
      env: { ...process.env, CODEX_BIN: fake, PROGRESS_CODEX_HOME: codexHome, EXPECTED_CODEX_HOME: codexHome, PROGRESS_CODEX_STATE_DIR: dir, PROGRESS_CODEX_TEST_PORT: String(port) },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await call('health')).ok) return; } catch { /* starting */ }
      await delay(20);
    }
    throw new Error('startup failed');
  }

  async function settle() {
    for (let i = 0; i < 100; i++) {
      const s = await call('state');
      if (['ready', 'error'].includes(s.status) || s.requests.length) return s;
      await delay(20);
    }
    throw new Error('turn timed out');
  }

  async function restart() {
    child.kill();
    await once(child, 'exit');
    await launch();
  }

  try {
    await launch();
    await run({ call, settle, restart, dir, scope });
  } finally {
    if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await rm(dir, { recursive: true, force: true });
  }
}

const lastText = s => s.messages.at(-1).parts.find(p => p.type === 'text')?.text;
const start = (call, text, extra = {}) => call('start', { text, instructions: 'read only', tools: [], ...extra });

test('health reports the shared service version', () => withService(async ({ call }) => {
  assert.equal((await call('health')).version, expectedVersion);
}));

test('direct turns stream results and survive provider reconnects', () => withService(async ({ call }) => {
  const direct = await call('complete', { text: 'hello', instructions: 'deep radar' });
  assert.equal(direct.t, 'ok');
  assert.match(direct.text, /^OK/);
  const recovered = await call('complete', { text: 'reconnect', instructions: 'deep radar' });
  assert.equal(recovered.text, 'RECOVERED');
}));

test('chat turn: init, skills, hidden execution, image input, rev counter', () => withService(async ({ call, settle, dir }) => {
  let s = await call('state');
  assert.equal(s.initialized, false);
  s = await call('init', { messages: [{ id: 'old', role: 'assistant', parts: [{ type: 'activity', id: 'command' }] }] });
  assert.equal(s.messages.length, 0);
  assert.equal(s.initialized, true);
  // init only takes effect once
  const again = await call('init', { messages: [{ id: 'x', role: 'user', parts: [{ type: 'text', text: 'x' }] }] });
  assert.equal(again.messages.length, 0);
  assert.equal(again.rev, s.rev);

  s = await call('directory', { cwd: dir });
  assert.equal(s.cwd, dir);

  const before = s.rev;
  await start(call, 'hello', { skills: [{ id: 'skill-1', name: 'diagnose', command: 'diagnose' }] });
  s = await settle();
  assert.match(lastText(s), /^OK/);
  assert.equal(s.messages.at(-1).parts.find(p => p.type === 'skill').name, 'diagnose');
  assert.ok(s.rev > before);
  for (const internal of ['items', 'diff', 'threadId', 'turnId', 'libraryKey', 'turnTextByItem']) {
    assert.equal(internal in s, false, `${internal} must stay inside the service`);
  }

  const imagePath = join(dir, 'image.png');
  await writeFile(imagePath, 'image');
  await start(call, '', { images: [{ id: 'image.png', name: 'image.png', url: '/image', path: imagePath, mimeType: 'image/png' }] });
  s = await settle();
  const assistant = [...s.messages].reverse().find(m => m.role === 'assistant');
  assert.match(assistant.parts.find(p => p.type === 'text').text, /IMAGE$/);
}));

test('a leaked-argument reply is an error and the retry rebuilds the thread', () => withService(async ({ call, settle }) => {
  await start(call, 'hello');
  let s = await settle();
  const firstThread = lastText(s).split(':')[1];

  await start(call, 'leak');
  s = await settle();
  assert.equal(s.status, 'error');
  assert.equal(lastText(s), '');
  assert.match(s.error, /工具参数名/);

  await start(call, 'hello', { retry: true });
  s = await settle();
  assert.equal(s.status, 'ready');
  assert.notEqual(lastText(s).split(':')[1], firstThread, 'poisoned thread must not be resumed');
}));

test('an empty reply after tools ran is an error, and retry recovers', () => withService(async ({ call, settle }) => {
  await start(call, 'blank');
  let s = await settle();
  assert.equal(s.requests[0].params.tool, 'webSearch');
  await call('claim', { id: 902 });
  await call('respond', { id: 902, result: { success: true, contentItems: [] } });
  s = await settle();
  assert.equal(s.status, 'error');
  assert.match(s.error, /没有给出最终回答/);

  await start(call, 'hello', { retry: true });
  s = await settle();
  assert.equal(s.status, 'ready');
  assert.equal(s.error, null);
}));

test('tool requests: claim is a lease and respond is idempotent', () => withService(async ({ call, settle }) => {
  await start(call, 'approve');
  let s = await settle();
  assert.equal(s.requests[0].params.tool, 'createTask');
  assert.equal(s.requests[0].claimed, false);

  assert.deepEqual(await call('claim', { id: 900 }), { claimed: true });
  assert.deepEqual(await call('claim', { id: 900 }), { claimed: false }, 'second claimer loses without an error');
  s = await call('state');
  assert.equal(s.requests[0].claimed, true);

  await call('respond', { id: 900, result: { success: true, contentItems: [] } });
  s = await settle();
  assert.equal(s.status, 'ready');
  assert.equal(s.requests.length, 0);

  // Late duplicates are harmless.
  assert.deepEqual(await call('claim', { id: 900 }), { claimed: false });
  const replay = await call('respond', { id: 900, result: { success: true, contentItems: [] } });
  assert.equal(replay.status, 'ready');
  assert.equal(replay.error, null);
}));

test('presentation is rendered generically: begin on claim, done on respond', () => withService(async ({ call, settle }) => {
  await start(call, 'search');
  let s = await settle();
  assert.equal(s.requests[0].params.tool, 'webSearch');

  const progress = { search: { id: 'call-1', query: 'q', sources: ['example.com'], status: 'searching', phase: 'search' } };
  await call('claim', { id: 901, presentation: progress });
  s = await call('state');
  let bar = s.messages.at(-1).parts.find(p => p.type === 'search');
  assert.equal(bar.status, 'searching');
  assert.equal(bar.callId, 'call-1');

  const finished = { search: { id: 'search-9', query: 'q', hits: [{ id: 'h', url: 'https://example.com', title: 'T' }], status: 'done' } };
  await call('respond', { id: 901, result: { success: true, contentItems: [] }, presentation: finished });
  s = await settle();
  const bars = s.messages.at(-1).parts.filter(p => p.type === 'search');
  assert.equal(bars.length, 1, 'begin and done must be one bar');
  assert.equal(bars[0].status, 'done');
  assert.equal(bars[0].hits.length, 1);
}));

test('stopping mid-search never leaves a spinning bar', () => withService(async ({ call, settle }) => {
  await start(call, 'search');
  await settle();
  await call('claim', { id: 901, presentation: { search: { id: 'call-1', status: 'fetching', phase: 'fetch' } } });
  await call('stop');
  const s = await settle();
  assert.equal(s.status, 'ready');
  assert.equal(s.messages.at(-1).parts.find(p => p.type === 'search').status, 'error');
}));

test('state survives a service restart and unknown actions are rejected', () => withService(async ({ call, settle, restart }) => {
  await start(call, 'hello');
  let s = await settle();
  const count = s.messages.length;
  await restart();
  s = await call('state');
  assert.equal(s.messages.length, count);
  assert.match((await call('nope')).error, /未知操作/);
}));
