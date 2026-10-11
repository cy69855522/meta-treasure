import { redirect } from "next/navigation";
import { parseSubreddit } from "@/features/hot-radar/lib/reddit";
import { DEFAULT_SUBREDDIT } from "@/features/hot-radar/lib/subreddits";

export const dynamic = "force-dynamic";

export default async function RedditHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; subreddit?: string }>;
}) {
  const params = await searchParams;
  const subreddit = parseSubreddit(params.subreddit) ?? DEFAULT_SUBREDDIT;
  const query = new URLSearchParams({ subreddit, history: "1" });
  if (params.date) query.set("date", params.date);
  redirect(`/hot-radar/reddit/hot?${query.toString()}`);
}
