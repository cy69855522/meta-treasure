import { NextRequest } from "next/server";
import {
  countNowTasks,
  deleteTask,
  getTask,
  updateTask,
} from "@/lib/db";
import type { Lane } from "@/lib/types";
import { NOW_WIP_LIMIT } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }
  return Response.json({ task });
}

export async function PATCH(request: NextRequest, { params }: Params) {
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
        {
          error: `Now 列已达 WIP 上限（${NOW_WIP_LIMIT}）。先完成或移出一项再继续。`,
        },
        { status: 400 },
      );
    }
  }

  const task = updateTask(id, body);
  return Response.json({ task });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = deleteTask(id);
  if (!ok) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
