import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { checkOrigin, checkScope } from "@/lib/codex-server";
import type { MessageImage } from "@/lib/types";

export const runtime = "nodejs";
const allowed = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/gif", "gif"]]);
const imageDir = path.join(process.cwd(), "data", "codex-images");

export async function POST(request: Request, { params }: { params: Promise<{ scope: string }> }) {
  try {
    checkOrigin(request);
    const { scope } = await params;
    checkScope(scope);
    const files = (await request.formData()).getAll("images").filter((item): item is File => item instanceof File);
    if (!files.length || files.length > 9) throw new Error("每次请选择 1 至 9 张图片");
    await fs.mkdir(imageDir, { recursive: true, mode: 0o700 });
    const images: MessageImage[] = [];
    for (const file of files) {
      const extension = allowed.get(file.type);
      if (!extension) throw new Error("仅支持 JPG、PNG、WebP 和 GIF 图片");
      if (file.size > 12 * 1024 * 1024) throw new Error("单张图片不能超过 12MB");
      const id = `${randomUUID()}.${extension}`;
      const filePath = path.join(imageDir, id);
      await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
      images.push({ id, name: file.name.slice(0, 200), mimeType: file.type, path: filePath, url: `/api/codex/images/${id}` });
    }
    return Response.json({ images });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "图片上传失败" }, { status: 400 });
  }
}
