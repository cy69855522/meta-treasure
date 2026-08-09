import { getProject, setProjectInPiggyBank } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getProject(id)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await request.json()) as { inPiggyBank?: boolean };
  if (typeof body.inPiggyBank !== "boolean") {
    return Response.json(
      { error: "inPiggyBank boolean is required" },
      { status: 400 },
    );
  }

  const project = setProjectInPiggyBank(id, body.inPiggyBank);
  return Response.json({ project });
}
