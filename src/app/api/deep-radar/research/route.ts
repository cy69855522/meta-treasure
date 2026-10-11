import { NextResponse } from "next/server";
import { createSession, listSessions } from "@/features/deep-radar/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sessions: listSessions() });
}

export async function POST() {
  const session = createSession();
  return NextResponse.json({ session });
}
