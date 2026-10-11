import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  RESEARCH_IMAGE_DIR,
  RESEARCH_IMAGE_EXT,
  RESEARCH_IMAGE_MAX,
  RESEARCH_IMAGE_MAX_BYTES,
} from "@/features/deep-radar/lib/research-images";
import type { MessageImage } from "@/features/deep-radar/lib/research-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const files = (await request.formData())
      .getAll("images")
      .filter((item): item is File => item instanceof File);
    if (!files.length || files.length > RESEARCH_IMAGE_MAX) {
      throw new Error("每次请选择 1 至 9 张图片");
    }
    await fs.mkdir(RESEARCH_IMAGE_DIR, { recursive: true, mode: 0o700 });
    const images: MessageImage[] = [];
    for (const file of files) {
      const extension = RESEARCH_IMAGE_EXT.get(file.type);
      if (!extension) throw new Error("仅支持 JPG、PNG、WebP 和 GIF 图片");
      if (file.size > RESEARCH_IMAGE_MAX_BYTES) throw new Error("单张图片不能超过 12MB");
      const id = `${randomUUID()}.${extension}`;
      const filePath = path.join(/* turbopackIgnore: true */ RESEARCH_IMAGE_DIR, id);
      await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()), {
        mode: 0o600,
      });
      images.push({
        id,
        name: file.name.slice(0, 200),
        mimeType: file.type,
        path: filePath,
        url: `/api/deep-radar/research/images/${id}`,
      });
    }
    return NextResponse.json({ images });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片上传失败" },
      { status: 400 },
    );
  }
}
