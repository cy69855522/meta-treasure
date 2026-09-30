import { listBusyAgentScopes } from "@/lib/agent-activity";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ busy: listBusyAgentScopes() });
}
