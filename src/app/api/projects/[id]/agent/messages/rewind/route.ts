import { getProject, rewindAgentMessages } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    messageId?: string;
    keepCount?: number;
    userOrdinal?: number;
    keepMessage?: boolean;
  };

  if (
    typeof body.keepCount !== "number" ||
    !Number.isFinite(body.keepCount) ||
    body.keepCount < 0
  ) {
    return Response.json({ error: "keepCount is required" }, { status: 400 });
  }

  const result = rewindAgentMessages(id, {
    messageId: body.messageId,
    keepCount: Math.floor(body.keepCount),
    userOrdinal:
      typeof body.userOrdinal === "number" && body.userOrdinal >= 0
        ? Math.floor(body.userOrdinal)
        : undefined,
    keepMessage: body.keepMessage === true,
  });

  return Response.json(result);
}
