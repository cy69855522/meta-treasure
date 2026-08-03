import { NextRequest } from "next/server";
import { deleteProject, getProject, updateProject } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return Response.json({ project });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<{
    name: string;
    slug: string;
    description: string;
    color: string;
  }>;

  if (body.name !== undefined && !body.name.trim()) {
    return Response.json({ error: "name cannot be empty" }, { status: 400 });
  }

  const project = updateProject(id, body);
  return Response.json({ project });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = deleteProject(id);
  if (!ok) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
