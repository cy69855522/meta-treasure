import type { UIMessage } from "ai";
import { getProject } from "@/lib/db";
import { streamProjectAgentChat } from "@/lib/project-agent";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      messages?: UIMessage[];
    };

    const result = await streamProjectAgentChat({
      projectId: id,
      uiMessages: body.messages ?? [],
      abortSignal: request.signal,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    const status = message === "Empty user message" ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
