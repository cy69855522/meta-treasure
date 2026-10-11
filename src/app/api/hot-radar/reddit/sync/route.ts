import { NextResponse } from "next/server";
import {
  startRedditMonitor,
  syncSnapshot,
} from "@/features/hot-radar/lib/reddit-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  startRedditMonitor();
  return NextResponse.json(syncSnapshot());
}
