import { DeepResearchAgent } from "@progress/deep-research";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      keyword?: string;
    };
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
    if (!keyword) {
      return Response.json({ error: "keyword is required" }, { status: 400 });
    }

    if (!process.env.TIKHUB_API_KEY?.trim()) {
      return Response.json(
        { error: "Missing TIKHUB_API_KEY in server environment" },
        { status: 500 },
      );
    }

    const agent = new DeepResearchAgent({
      apiKey: process.env.TIKHUB_API_KEY,
      timeoutMs: 60_000,
    });
    const result = await agent.search(keyword);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Deep research search failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
