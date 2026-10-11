import { NextResponse } from "next/server";
import { extractPageText } from "@/features/hot-radar/lib/extract-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
    permalink?: unknown;
  } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const permalink = typeof body?.permalink === "string" ? body.permalink : url;
  if (!url) {
    return NextResponse.json({ ok: false, error: "缺少链接" }, { status: 400 });
  }
  const result = await extractPageText(url, permalink);
  return NextResponse.json(result);
}
