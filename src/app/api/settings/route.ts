import { getSettings, updateSettings } from "@/lib/settings";
import type { ThemeMode } from "@/lib/settings-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ settings: getSettings() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { theme?: ThemeMode };
  const settings = updateSettings({
    theme: body.theme,
  });
  return Response.json({ settings });
}
