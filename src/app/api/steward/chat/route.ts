import type { UIMessage } from "ai";
import { streamStewardChat } from "@/lib/steward";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: UIMessage[];
    };

    const result = await streamStewardChat({
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
