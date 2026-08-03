import { NextRequest } from "next/server";
import { createProject, listProjects } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ projects: listProjects() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    description?: string;
    color?: string;
  };

  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const project = createProject({
      name: body.name.trim(),
      slug: body.slug,
      description: body.description,
      color: body.color,
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create project",
      },
      { status: 400 },
    );
  }
}
