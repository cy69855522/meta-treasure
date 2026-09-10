import type { UIMessage } from "ai";
import { formatLlmError } from "@/lib/llm-error";
import { streamStewardChat } from "@/lib/steward";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: UIMessage[];
      trigger?: "submit-message" | "regenerate-message";
    };

    const result = await streamStewardChat({
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
