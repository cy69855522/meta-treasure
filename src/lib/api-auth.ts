import { NextRequest } from "next/server";

export function requireApiKey(request: NextRequest): Response | null {
  const expected = process.env.API_KEY || "dev-local-key";
  const provided =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!provided || provided !== expected) {
    return Response.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }
  return null;
}
