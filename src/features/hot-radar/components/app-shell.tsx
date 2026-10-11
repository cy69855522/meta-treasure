import { Sidebar } from "@/features/hot-radar/components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Sidebar>{children}</Sidebar>
    </div>
  );
}
