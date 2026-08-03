import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { countNowTasks, getTask, updateTask } from "@/lib/db";
import type { Lane } from "@/lib/types";
import { NOW_WIP_LIMIT } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * External Agent API:
 * PATCH /api/v1/tasks/:id
 * Header: X-API-Key: <API_KEY>
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const existing = getTask(id);
  if (!existing) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<{
    title: string;
    projectId: string | null;
    lane: Lane;
    content: string;
    attributes: Record<string, string>;
    sortOrder: number;
  }>;

  const nextLane = body.lane ?? existing.lane;
  const nextProjectId =
    body.projectId !== undefined ? body.projectId : existing.projectId;

  if (
    nextLane === "now" &&
    nextProjectId &&
    !(existing.lane === "now" && existing.projectId === nextProjectId)
  ) {
    if (countNowTasks(nextProjectId) >= NOW_WIP_LIMIT) {
      return Response.json(
        { error: `Now WIP limit (${NOW_WIP_LIMIT}) reached` },
        { status: 400 },
      );
    }
  }

  const task = updateTask(id, body);
  return Response.json({ task });
}
