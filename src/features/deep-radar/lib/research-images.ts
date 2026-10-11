import { existsSync } from "node:fs";
import path from "node:path";
import type { MessageImage } from "@/features/deep-radar/lib/research-types";

export const RESEARCH_IMAGE_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "research-images",
);
export const RESEARCH_IMAGE_ID_RE = /^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/;
export const RESEARCH_IMAGE_MAX = 9;
export const RESEARCH_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const RESEARCH_IMAGE_EXT = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
export const RESEARCH_IMAGE_MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
} as const;

export function researchImagePath(id: string) {
  if (!RESEARCH_IMAGE_ID_RE.test(id)) throw new Error("图片不存在");
  return path.join(/* turbopackIgnore: true */ RESEARCH_IMAGE_DIR, id);
}

export function parseMessageImages(value: string | null | undefined): MessageImage[] {
  try {
    return acceptedMessageImages(JSON.parse(value || "[]"));
  } catch {
    return [];
  }
}

export function acceptedMessageImages(raw: unknown): MessageImage[] {
  if (!Array.isArray(raw)) return [];
  const images: MessageImage[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, RESEARCH_IMAGE_MAX)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<MessageImage>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!RESEARCH_IMAGE_ID_RE.test(id) || seen.has(id)) continue;
    const filePath = path.join(/* turbopackIgnore: true */ RESEARCH_IMAGE_DIR, id);
    if (!existsSync(filePath)) continue;
    const extension = id.split(".").at(-1) as keyof typeof RESEARCH_IMAGE_MIME;
    seen.add(id);
    images.push({
      id,
      name: String(row.name || "image").slice(0, 200),
      url: `/api/deep-radar/research/images/${id}`,
      path: filePath,
      mimeType: RESEARCH_IMAGE_MIME[extension],
    });
  }
  return images;
}

export function collectSessionImages(messages: Array<{ images?: MessageImage[] }>): MessageImage[] {
  const images: MessageImage[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    for (const image of message.images ?? []) {
      if (!image?.path || seen.has(image.id)) continue;
      seen.add(image.id);
      images.push(image);
      if (images.length >= RESEARCH_IMAGE_MAX) return images;
    }
  }
  return images;
}
