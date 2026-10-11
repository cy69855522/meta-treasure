import { NextResponse } from "next/server";
import { listFavoriteSnapshots } from "@/features/deep-radar/lib/service";
import { wireRuntime } from "@/features/deep-radar/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  wireRuntime();
  return NextResponse.json({ favorites: listFavoriteSnapshots(200) });
}
