import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/features/deep-radar/lib/settings";
import type { AppSettings } from "@/features/deep-radar/lib/settings-types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ settings: getSettings() });
}

export async function PATCH(request: Request) {
  const patch = (await request.json()) as Partial<AppSettings>;
  return NextResponse.json({ settings: updateSettings(patch) });
}
