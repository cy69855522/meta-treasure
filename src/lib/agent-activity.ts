import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const stateDir = path.join(
  process.env.XDG_STATE_HOME || path.join(homedir(), ".local/state"),
  "progress-codex",
);

/** Scopes whose Codex turn is still running (reasoning, tools, or pending requests). */
export function listBusyAgentScopes(): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(stateDir);
  } catch {
    return [];
  }
  const busy: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const data = JSON.parse(
        readFileSync(path.join(stateDir, name), "utf8"),
      ) as { scope?: unknown; status?: unknown; requests?: unknown };
      const scope =
        typeof data.scope === "string" ? data.scope : name.slice(0, -".json".length);
      const pending = Array.isArray(data.requests) && data.requests.length > 0;
      if (data.status === "submitted" || data.status === "streaming" || pending) {
        busy.push(scope);
      }
    } catch {
      /* Session file may be mid-write. */
    }
  }
  return busy;
}
