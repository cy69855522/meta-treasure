import { parse, type HTMLElement } from "node-html-parser";
import { PAGE_EXTRACT_CHAR_LIMIT } from "../limits";
import { stripHtml } from "../client";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export async function fetchHtml(
  url: string,
  options: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    cookie?: string;
  } = {},
): Promise<{ html: string; finalUrl: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.headers ?? {}),
      },
    });
    const html = await res.text();
    return { html, finalUrl: res.url || url, status: res.status };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`抓取超时：${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function parseHtml(html: string): HTMLElement {
  return parse(html);
}

export function textOf(el: HTMLElement | null | undefined): string {
  if (!el) return "";
  return stripHtml(el.text || "").replace(/\s+/g, " ").trim();
}

export function absUrl(href: string, base: string): string {
  const raw = href.trim();
  if (!raw || raw.startsWith("javascript:") || raw.startsWith("#")) return "";
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw.startsWith("http") ? raw : "";
  }
}

export function pagePlainText(html: string): string {
  const root = parseHtml(html);
  for (const sel of ["script", "style", "noscript", "svg", "nav", "footer"]) {
    for (const node of root.querySelectorAll(sel)) node.remove();
  }
  const content =
    root.querySelector("article") ||
    root.querySelector("main") ||
    root.querySelector("#js_content") ||
    root.querySelector("body") ||
    root;
  return textOf(content).slice(0, PAGE_EXTRACT_CHAR_LIMIT);
}
