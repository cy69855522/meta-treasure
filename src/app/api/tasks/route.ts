import { NextRequest } from "next/server";
import { countNowTasks, createTask, listTasks } from "@/lib/db";
import type { Lane } from "@/lib/types";
import { NOW_WIP_LIMIT } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const lane = searchParams.get("lane") as Lane | null;
  const inboxOnly = searchParams.get("inbox") === "1";

  const tasks = listTasks({
    projectId: projectId,
    lane: lane ?? undefined,
    inboxOnly,
  });

  return Response.json({ tasks });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    title?: string;
    projectId?: string | null;
    lane?: Lane;
    content?: string;
    attributes?: Record<string, string>;
  };

  if (!body.title?.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const lane = body.lane ?? "inbox";
  if (lane === "now" && body.projectId) {
    if (countNowTasks(body.projectId) >= NOW_WIP_LIMIT) {
      return Response.json(
        { error: `Now WIP limit (${NOW_WIP_LIMIT}) reached` },
        { status: 400 },
      );
    }
  }

  const task = createTask({
    title: body.title.trim(),
    projectId: body.projectId ?? null,
    lane,
    content: body.content,
    attributes: body.attributes,
  });

  return Response.json({ task }, { status: 201 });
}
