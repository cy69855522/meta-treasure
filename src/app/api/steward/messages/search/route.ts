import { searchStewardMessages } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  if (!q) {
    return Response.json({ hits: [] });
  }
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    100,
    Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || 40 : 40),
  );

  return Response.json({
    hits: searchStewardMessages(q, { limit }),
  });
}
