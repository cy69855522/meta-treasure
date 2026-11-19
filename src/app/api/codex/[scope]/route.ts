import {
  checkOrigin,
  checkScope,
  getCodexState,
  respondToCodexRequest,
  setCodexDirectory,
  setCodexModel,
  startCodex,
  stopCodex,
} from "@/lib/codex-server";
import type { CodexAction } from "@/lib/codex-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ scope: string }> };

const fail = (error: unknown) =>
  Response.json({ error: error instanceof Error ? error.message : "请求失败" }, { status: 400 });

export async function GET(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { scope } = await context.params;
    checkScope(scope);
    const state = await getCodexState(scope);
    const since = new URL(request.url).searchParams.get("since");
    if (since !== null && Number(since) === state.rev) {
      return Response.json({ unchanged: true, rev: state.rev });
    }
    return Response.json(state);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { scope } = await context.params;
    checkScope(scope);
    const command = (await request.json()) as CodexAction;
    switch (command.action) {
      case "start":
        return Response.json(
          await startCodex(scope, command.text, command.images, command.retry === true, command.modelId),
        );
      case "model":
        return Response.json(await setCodexModel(scope, command.modelId));
      case "directory":
        return Response.json(await setCodexDirectory(scope, command.cwd));
      case "respond":
        return Response.json(
          await respondToCodexRequest(scope, String(command.id), command.approved === true, command.answers),
        );
      case "stop":
        return Response.json(await stopCodex(scope));
      default:
        throw new Error("未知操作");
    }
  } catch (e) {
    return fail(e);
  }
}
