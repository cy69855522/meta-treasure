import {
  buildActionPreview,
  isAgentToolName,
  type AgentToolScope,
} from "@/lib/agent-tools";
import { getProject } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      scope?: AgentToolScope;
      projectId?: string;
      toolName?: string;
      input?: unknown;
    };

    if (body.scope !== "project" && body.scope !== "steward") {
      return Response.json({ error: "Invalid scope" }, { status: 400 });
    }
    if (!body.toolName || !isAgentToolName(body.toolName)) {
      return Response.json({ error: "Invalid toolName" }, { status: 400 });
    }
    if (body.scope === "project") {
      if (!body.projectId || !getProject(body.projectId)) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
    }

    const preview = buildActionPreview({
      scope: body.scope,
      projectId: body.projectId,
      toolName: body.toolName,
      input: body.input ?? {},
    });

    return Response.json({ preview });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Preview failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
