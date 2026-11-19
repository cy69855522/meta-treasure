import { checkOrigin, rewindCodex, rewindResponseBody } from "@/lib/codex-server";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const b = await request.json();
    const state = await rewindCodex("steward", b.messageId, b.keepMessage === true);
    return Response.json(rewindResponseBody(state));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "撤回失败" }, { status: 400 });
  }
}
