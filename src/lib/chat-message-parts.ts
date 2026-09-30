import type { UIMessagePart } from "@/lib/codex-types";
import type {
  InvokedRadar,
  InvokedRule,
  InvokedSearch,
  InvokedSkill,
  MessageImage,
} from "@/lib/types";

/** Rebuild ordered UI parts so search bars stay interleaved with text. */
export function partsFromStoredMessage(message: {
  content: string;
  skills?: InvokedSkill[];
  rules?: InvokedRule[];
  searches?: InvokedSearch[];
  radars?: InvokedRadar[];
  images?: MessageImage[];
}): UIMessagePart[] {
  const parts: UIMessagePart[] = [
    ...(message.skills || []).map((skill) => ({ type: "skill" as const, ...skill })),
    ...(message.rules || []).map((rule) => ({ type: "rule" as const, ...rule })),
    ...(message.images || []).map((image) => ({ type: "image" as const, ...image })),
  ];
  const appendRadars = () => {
    for (const radar of message.radars || []) {
      if (!radar.sessionId) continue;
      parts.push({ type: "radar", ...radar });
    }
  };

  const content = message.content || "";
  const searches = [...(message.searches || [])].sort(
    (a, b) => (a.at ?? 0) - (b.at ?? 0),
  );

  if (searches.length === 0) {
    if (content) parts.push({ type: "text", text: content });
    appendRadars();
    return parts;
  }

  let cursor = 0;
  for (const search of searches) {
    const at = Math.max(
      0,
      Math.min(typeof search.at === "number" ? search.at : content.length, content.length),
    );
    if (at > cursor) {
      parts.push({ type: "text", text: content.slice(cursor, at) });
    }
    parts.push({ type: "search", ...search });
    cursor = at;
  }
  if (cursor < content.length) {
    parts.push({ type: "text", text: content.slice(cursor) });
  }
  appendRadars();
  return parts;
}

/** Snapshot search parts with text offsets for DB persistence. */
export function searchesWithTextOffsets(
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>,
): InvokedSearch[] {
  let textLen = 0;
  const searches: InvokedSearch[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      textLen += typeof part.text === "string" ? part.text.length : 0;
      continue;
    }
    if (part.type !== "search" || typeof part.id !== "string") continue;
    searches.push({
      id: part.id,
      query: typeof part.query === "string" ? part.query : "",
      sources: Array.isArray(part.sources)
        ? part.sources.filter((source): source is string => typeof source === "string")
        : [],
      hits: Array.isArray(part.hits) ? (part.hits as InvokedSearch["hits"]) : [],
      pages: Array.isArray(part.pages) ? (part.pages as InvokedSearch["pages"]) : [],
      at: textLen,
      ...(typeof part.status === "string"
        ? { status: part.status as InvokedSearch["status"] }
        : {}),
      ...(typeof part.phase === "string"
        ? { phase: part.phase as InvokedSearch["phase"] }
        : {}),
      ...(typeof part.callId === "string" ? { callId: part.callId } : {}),
      ...(typeof part.error === "string" && part.error ? { error: part.error } : {}),
    });
  }
  return searches;
}
