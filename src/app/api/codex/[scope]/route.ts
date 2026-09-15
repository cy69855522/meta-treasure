import { checkOrigin, checkScope, codexCall, getCodexState, respond, setCodexModel, startCodex } from "@/lib/codex-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ scope: string }> };
export async function GET(request: Request, context: Context) {
  try {
    checkOrigin(request); const {scope} = await context.params; checkScope(scope);
    return Response.json(await getCodexState(scope));
  } catch(e) { return Response.json({error: e instanceof Error ? e.message : "请求失败"}, {status:400}); }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request); const {scope} = await context.params; checkScope(scope);
    const b = await request.json();
    let result;
    if (b.action === "start") result = await startCodex(scope, b.text, b.images, b.retry === true, b.modelId);
    else if (b.action === "model") result = await setCodexModel(scope, b.modelId);
    else if (b.action === "directory") result = await codexCall("directory", {scope, cwd: b.cwd});
    else if (b.action === "respond") result = await respond(scope, String(b.id), b.approved === true, b.answers);
    else if (b.action === "stop") result = await codexCall("stop", {scope});
    else throw new Error("未知操作");
    return Response.json(result);
  } catch(e) { return Response.json({error:e instanceof Error ? e.message : "请求失败"},{status:400}); }
}
