import { rewindStewardMessages } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messageId?: string;
    keepCount?: number;
    userOrdinal?: number;
  };

  if (
    typeof body.keepCount !== "number" ||
    !Number.isFinite(body.keepCount) ||
    body.keepCount < 0
  ) {
    return Response.json({ error: "keepCount is required" }, { status: 400 });
  }

  const result = rewindStewardMessages({
    messageId: body.messageId,
    keepCount: Math.floor(body.keepCount),
    userOrdinal:
      typeof body.userOrdinal === "number" && body.userOrdinal >= 0
        ? Math.floor(body.userOrdinal)
        : undefined,
  });

  return Response.json(result);
}
