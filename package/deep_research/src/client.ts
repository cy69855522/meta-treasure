import { DEFAULT_TIKHUB_BASE_URL } from "./types";

export class TikHubError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "TikHubError";
  }
}

export type TikHubClientOptions = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export class TikHubClient {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(options: TikHubClientOptions) {
    const key = options.apiKey.trim();
    if (!key) {
      throw new TikHubError("Missing TikHub API key");
    }
    this.apiKey = key;
    this.baseUrl = (options.baseUrl ?? DEFAULT_TIKHUB_BASE_URL).replace(
      /\/$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async getJson<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T> {
    const url = new URL(
      path.startsWith("http") ? path : `${this.baseUrl}${path}`,
    );
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === "") continue;
        url.searchParams.set(k, String(v));
      }
    }
    return this.request<T>(url.toString(), { method: "GET" });
  }

  async postJson<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    return this.request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new TikHubError(
          `TikHub returned non-JSON (HTTP ${res.status})`,
          res.status,
          text.slice(0, 500),
        );
      }

      if (!res.ok) {
        const msg = extractTikHubMessage(json) ?? `TikHub HTTP ${res.status}`;
        throw new TikHubError(msg, res.status, json);
      }

      const envelope = json as { code?: number; detail?: unknown };
      if (
        typeof envelope?.code === "number" &&
        envelope.code !== 200 &&
        envelope.code !== 0
      ) {
        throw new TikHubError(
          extractTikHubMessage(json) ?? `TikHub code ${envelope.code}`,
          envelope.code,
          json,
        );
      }

      return json as T;
    } catch (err) {
      if (err instanceof TikHubError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new TikHubError(`TikHub request timed out after ${this.timeoutMs}ms`);
      }
      throw new TikHubError(
        err instanceof Error ? err.message : "TikHub request failed",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractTikHubMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.message_zh === "string" && obj.message_zh.trim()) {
    return obj.message_zh.trim();
  }
  if (typeof obj.message === "string" && obj.message.trim()) {
    return obj.message.trim();
  }
  const detail = obj.detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.message_zh === "string" && d.message_zh.trim()) {
      return d.message_zh.trim();
    }
    if (typeof d.message === "string" && d.message.trim()) {
      return d.message.trim();
    }
  }
  return null;
}

/** Dig into nested objects for the first array of plain objects. */
export function findObjectList(
  root: unknown,
  preferredKeys: string[] = [],
): Record<string, unknown>[] {
  if (!root) return [];

  const tryKey = (obj: Record<string, unknown>, key: string) => {
    const v = obj[key];
    if (Array.isArray(v) && v.length > 0 && isPlainObject(v[0])) {
      return v as Record<string, unknown>[];
    }
    return null;
  };

  if (isPlainObject(root)) {
    for (const key of preferredKeys) {
      const hit = tryKey(root, key);
      if (hit) return hit;
    }
  }

  const queue: unknown[] = [root];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      if (cur.length > 0 && isPlainObject(cur[0])) {
        return cur as Record<string, unknown>[];
      }
      for (const item of cur) queue.push(item);
      continue;
    }
    if (isPlainObject(cur)) {
      for (const key of preferredKeys) {
        const hit = tryKey(cur, key);
        if (hit) return hit;
      }
      for (const v of Object.values(cur)) queue.push(v);
    }
  }
  return [];
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Strip simple HTML tags (e.g. Zhihu highlight &lt;em&gt;) and collapse whitespace. */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const parts = key.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
      if (!isPlainObject(cur)) {
        cur = undefined;
        break;
      }
      cur = cur[part];
    }
    const s = asString(cur);
    if (s) return s;
  }
  return undefined;
}

export function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export function formatUnixOrString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: WeChat/Zhihu sometimes return weird large ints; treat
    // values that look like unix seconds/ms as dates.
    if (value > 1e9 && value < 1e12) {
      try {
        return new Date(value * 1000).toISOString();
      } catch {
        return String(value);
      }
    }
    if (value > 1e12 && value < 1e14) {
      try {
        return new Date(value).toISOString();
      } catch {
        return String(value);
      }
    }
  }
  return asString(value);
}

/**
 * Pull known engagement counters from a TikHub object into Chinese-labeled metrics.
 */
export function extractMetrics(obj: Record<string, unknown>): Record<string, number> {
  const mapping: Array<[string, string[]]> = [
    ["点赞", ["voteup_count", "upvote_count", "like_count", "likes", "digg_count"]],
    ["评论", ["comment_count", "comments", "reply_count"]],
    ["收藏", ["zfav_count", "favlist_count", "favorite_count", "collect_count", "favorites"]],
    ["浏览", ["visits_count", "view_count", "read_count", "pv", "play_count"]],
    ["关注", ["follower_count", "followers"]],
    ["回答", ["answer_count"]],
    ["感谢", ["thanks_count"]],
    ["分享", ["share_count"]],
  ];
  const out: Record<string, number> = {};
  for (const [label, keys] of mapping) {
    for (const key of keys) {
      const n = asFiniteNumber(obj[key]);
      if (n !== undefined) {
        out[label] = n;
        break;
      }
    }
  }
  return out;
}
