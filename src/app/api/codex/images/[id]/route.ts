import { promises as fs } from "node:fs";
import path from "node:path";
import { checkOrigin } from "@/lib/codex-server";

export const runtime = "nodejs";
const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { id } = await params;
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(id)) throw new Error("图片不存在");
    const extension = id.split(".").at(-1) as keyof typeof mime;
    const data = await fs.readFile(path.join(process.cwd(), "data", "codex-images", id));
    return new Response(data, { headers: { "Content-Type": mime[extension], "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
