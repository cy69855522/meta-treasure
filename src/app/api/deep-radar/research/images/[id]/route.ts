import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import {
  RESEARCH_IMAGE_MIME,
  researchImagePath,
} from "@/features/deep-radar/lib/research-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const filePath = researchImagePath(id);
    const extension = id.split(".").at(-1) as keyof typeof RESEARCH_IMAGE_MIME;
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": RESEARCH_IMAGE_MIME[extension],
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
