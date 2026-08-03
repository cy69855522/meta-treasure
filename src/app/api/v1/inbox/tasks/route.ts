import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { createTask } from "@/lib/db";
import type { Lane } from "@/lib/types";

export const runtime = "nodejs";

/**
 * External Agent API:
 * POST /api/v1/inbox/tasks
 * Header: X-API-Key: <API_KEY>
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as {
    title?: string;
    projectId?: string | null;
    content?: string;
    attributes?: Record<string, string>;
    lane?: Lane;
  };

  if (!body.title?.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const task = createTask({
    title: body.title.trim(),
    projectId: body.projectId ?? null,
    lane: body.lane ?? "inbox",
    content: body.content,
    attributes: body.attributes,
  });

  return Response.json({ task }, { status: 201 });
}
