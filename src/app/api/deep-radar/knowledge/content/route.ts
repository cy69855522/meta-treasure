import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveKnowledgeFile } from "@/features/deep-radar/lib/knowledge-base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function rewriteLocalHtmlAssets(html: string, relativePath: string) {
  const base = path.posix.dirname(relativePath);
  return html.replace(
    /\b(src|poster)=(['"])(?![a-z]+:|\/|#)([^'"]+)\2/gi,
    (_match, attribute: string, quote: string, value: string) => {
      const target = path.posix.normalize(path.posix.join(base, value));
      const url = `/api/deep-radar/knowledge/content?path=${encodeURIComponent(target)}`;
      return `${attribute}=${quote}${url}${quote}`;
    },
  );
}

export async function GET(request: Request) {
  const relativePath = new URL(request.url).searchParams.get("path") ?? "";
  try {
    const resolved = await resolveKnowledgeFile(relativePath);
    let data: BodyInit = await fs.readFile(resolved.absolutePath);
    const extension = path.extname(resolved.absolutePath).toLowerCase();
    const headers: Record<string, string> = {
      "Content-Type": MIME[extension] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if ([".html", ".htm"].includes(extension)) {
      data = rewriteLocalHtmlAssets(data.toString(), relativePath);
      headers["Content-Security-Policy"] =
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
    }
    return new NextResponse(data, { headers });
  } catch {
    return NextResponse.json({ error: "文件不存在或路径不合法" }, { status: 404 });
  }
}
