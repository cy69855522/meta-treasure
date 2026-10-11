import { RedditNav } from "@/features/hot-radar/components/reddit-nav";

export default function RedditLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RedditNav />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
