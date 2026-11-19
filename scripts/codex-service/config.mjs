import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Single source of truth shared with the Next.js clients (see src/lib/codex-service-client.ts). */
export const SERVICE_VERSION = JSON.parse(
  readFileSync(new URL('./version.json', import.meta.url), 'utf8'),
).version;

export const COMPLETE_TURN_TIMEOUT_MS = Number(process.env.DEEP_RADAR_CODEX_TURN_MS) || 900_000;
export const WORKSPACE_TURN_TIMEOUT_MS = Number(process.env.DEEP_RADAR_CODEX_WORKSPACE_MS) || 300_000;
export const ERROR_RETRY_IDLE_MS = Number(process.env.DEEP_RADAR_CODEX_ERROR_IDLE_MS) || 90_000;
export const KEEPALIVE_MS = Number(process.env.DEEP_RADAR_CODEX_KEEPALIVE_MS) || 20_000;
export const RPC_TIMEOUT_MS = 60_000;
/** A claimed tool request is owned by its claimer this long before another worker may take it. */
export const REQUEST_LEASE_MS = 180_000;

export const testPort = process.env.PROGRESS_CODEX_TEST_PORT
  ? Number(process.env.PROGRESS_CODEX_TEST_PORT)
  : null;

export const workspaceRoot = process.cwd();
export const stateDir =
  process.env.PROGRESS_CODEX_STATE_DIR ||
  join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'progress-codex');
export const codexHome = process.env.PROGRESS_CODEX_HOME || join(homedir(), '.progress', 'codex');
export const deepRadarWorkspace = join(codexHome, 'workspace');

export function ensureDirectories() {
  for (const path of [stateDir, codexHome, deepRadarWorkspace]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
}

export const readToken = () => readFileSync(join(stateDir, 'token'), 'utf8').trim();

export function childEnvironment(extra = {}) {
  const baseNoProxy = process.env.no_proxy || process.env.NO_PROXY || 'localhost,127.0.0.1,::1,.local';
  const directHosts = ['bboluo.com', 'llm.knifeproart.com'];
  const noProxy = directHosts.reduce(
    (value, host) => (value.includes(host) ? value : `${value},${host}`),
    baseNoProxy,
  );
  const env = {
    ...process.env,
    ...extra,
    CODEX_HOME: codexHome,
    // bboluo.com 与本机 LLMLite 直连，不走 Clash Verge；其他域名仍走代理
    http_proxy: 'http://127.0.0.1:7897',
    https_proxy: 'http://127.0.0.1:7897',
    no_proxy: noProxy,
    NO_PROXY: noProxy,
  };
  // The bridge is launched by Next.js dev and otherwise leaks
  // NODE_ENV=development into `next build`. Let each child command choose its
  // own mode, as npm/Next.js normally does when launched from a shell.
  delete env.NODE_ENV;
  return env;
}

export function resolveCli() {
  return (
    process.env.CODEX_BIN ||
    (process.env.PATH || '')
      .split(':')
      .map(d => join(d, 'codex'))
      .find(f => existsSync(f)) ||
    (existsSync('/usr/lib/chatgpt/resources/codex') ? '/usr/lib/chatgpt/resources/codex' : 'codex')
  );
}
