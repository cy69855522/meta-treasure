import { NextRequest } from "next/server";
import { getTask, reorderTasks } from "@/lib/db";
import type { Lane } from "@/lib/types";
import { NOW_WIP_LIMIT } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    updates?: Array<{
      id: string;
      lane: Lane;
      sortOrder: number;
      projectId?: string | null;
    }>;
  };

  if (!body.updates?.length) {
    return Response.json({ error: "updates required" }, { status: 400 });
  }

  const nowByProject = new Map<string, number>();
  for (const update of body.updates) {
    if (update.lane !== "now") continue;
    const existing = getTask(update.id);
    if (!existing) continue;
    const projectId =
      update.projectId !== undefined ? update.projectId : existing.projectId;
    if (!projectId) continue;
    nowByProject.set(projectId, (nowByProject.get(projectId) ?? 0) + 1);
  }

  for (const [, count] of nowByProject) {
    if (count > NOW_WIP_LIMIT) {
      return Response.json(
        {
          error: `Now 列已达 WIP 上限（${NOW_WIP_LIMIT}）。当前拟放置 ${count} 项。`,
        },
        { status: 400 },
      );
    }
  }

  reorderTasks(body.updates);
  return Response.json({ ok: true });
}
