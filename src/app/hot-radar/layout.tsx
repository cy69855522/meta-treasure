import type { Metadata } from "next";
import { AppShell } from "@/features/hot-radar/components/app-shell";

export const metadata: Metadata = {
  title: "Hot Radar · Progress",
};

export default function HotRadarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
