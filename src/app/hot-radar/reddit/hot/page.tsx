import { HotPosts } from "@/features/hot-radar/components/hot-posts";
import {
  listHistoryDays,
  postsForSubreddit,
  postsForSubredditAt,
} from "@/features/hot-radar/lib/reddit-db";
import {
  startRedditMonitor,
  syncSnapshot,
} from "@/features/hot-radar/lib/reddit-sync";
import { parseSubreddit } from "@/features/hot-radar/lib/reddit";
import { DEFAULT_SUBREDDIT } from "@/features/hot-radar/lib/subreddits";

export const dynamic = "force-dynamic";

export default async function RedditHotPage({
  searchParams,
}: {
  searchParams: Promise<{ subreddit?: string; date?: string; history?: string }>;
}) {
  startRedditMonitor();
  const params = await searchParams;
  const subreddit = parseSubreddit(params.subreddit);
  const sync = syncSnapshot();
  const historyDays = listHistoryDays();
  const historyDate = historyDays.some((day) => day.fetchedOn === params.date)
    ? params.date
    : undefined;
  const selectedSubreddit = subreddit ?? DEFAULT_SUBREDDIT;
  const posts = historyDate
    ? postsForSubredditAt(selectedSubreddit, historyDate)
    : postsForSubreddit(selectedSubreddit);

  if (!subreddit) {
    return (
      <HotPosts
        subreddit={DEFAULT_SUBREDDIT}
        posts={posts}
        invalidSubreddit={params.subreddit}
        sync={sync}
        historyDays={historyDays}
        historyDate={historyDate}
        historyOpen={params.history === "1"}
      />
    );
  }

  return (
    <HotPosts
      subreddit={subreddit}
      posts={posts}
      sync={sync}
      historyDays={historyDays}
      historyDate={historyDate}
      historyOpen={params.history === "1"}
    />
  );
}
