import { syncCodexMessages } from "@/lib/db";
import { checkOrigin, checkScope, codexCall } from "@/lib/codex-server";
export async function POST(request: Request, { params }: {params:Promise<{id:string}>}) {
 const {id} = await params;
 try { checkOrigin(request); const scope = id; checkScope(scope); const b = await request.json();
 const state = await codexCall("rewind", {scope,messageId:b.messageId,keepMessage:b.keepMessage === true});
 syncCodexMessages(scope,state.messages);
 return Response.json({messages:state.messages.map(m => ({
  id:m.id, role:m.role,
  content:m.parts.filter(p=>p.type==="text").map(p=>p.type==="text"?p.text:"").join(""),
  skills:m.parts.filter(p=>p.type==="skill").map(p=>({id:String(p.id),name:String(p.name),command:String(p.command)})),
  images:m.parts.filter(p=>p.type==="image").map(p=>({id:String(p.id),name:String(p.name),url:String(p.url),path:String(p.path),mimeType:String(p.mimeType)})),
 })),hasMore:false});
 } catch(e) { return Response.json({error:e instanceof Error?e.message:"撤回失败"},{status:400}); }
}
