import type { UIMessage } from "ai";
import { getProject } from "@/lib/db";
import { formatLlmError } from "@/lib/llm-error";
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
      trigger?: "submit-message" | "regenerate-message";
    };

    const result = await streamProjectAgentChat({
      projectId: id,
      uiMessages: body.messages ?? [],
      abortSignal: request.signal,
      trigger: body.trigger,
    });

    return result.toUIMessageStreamResponse({
      onError: formatLlmError,
    });
  } catch (error) {
    const message = formatLlmError(error);
    const status =
      error instanceof Error && error.message === "Empty user message"
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
