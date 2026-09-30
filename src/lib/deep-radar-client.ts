import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DeepRadarProgress } from "@/lib/types";

const DEFAULT_BASE = "http://127.0.0.1:3433";

function tokenFile() {
  const dir = join(
    process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
    "deep-radar-progress",
  );
  return { dir, file: join(dir, "token") };
}

/** Same token Deep Radar accepts on /api/progress. */
export function deepRadarBridgeToken(): string {
  const fromEnv = process.env.DEEP_RADAR_PROGRESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const { dir, file } = tokenFile();
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* create below so the first Progress call matches a freshly started Deep Radar */
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString("hex");
  writeFileSync(file, token, { mode: 0o600 });
  return token;
}

export function deepRadarBaseUrl(): string {
  return (process.env.DEEP_RADAR_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

export async function deepRadarFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${deepRadarBaseUrl()}${path}`, {
      method: init?.method || "GET",
      headers: {
        Authorization: `Bearer ${deepRadarBridgeToken()}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "连不上 Deep Radar（http://127.0.0.1:3433）。请先在本机启动 Deep Radar。",
    );
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Deep Radar 请求失败（${response.status}）`);
  }
  return data;
}

export async function fetchDeepRadarProgress(sessionId: string) {
  const data = await deepRadarFetch<{ progress: DeepRadarProgress }>(
    `/api/progress/sessions/${encodeURIComponent(sessionId)}/progress`,
  );
  return data.progress;
}
