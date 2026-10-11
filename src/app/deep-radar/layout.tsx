import type { Metadata } from "next";

import { AppShell } from "@/features/deep-radar/components/app-shell";

export const metadata: Metadata = {
  title: "Deep Radar · Progress",
};

export default function DeepRadarLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
