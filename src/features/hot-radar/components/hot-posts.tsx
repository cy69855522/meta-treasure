import { ArrowUpRight } from "lucide-react";
import { ExtractButton } from "@/features/hot-radar/components/extract-button";
import { RedditToolbar } from "@/features/hot-radar/components/reddit-toolbar";
import type { HistoryDay, ListedRedditPost } from "@/features/hot-radar/lib/reddit-db";
import type { RedditSyncSnapshot } from "@/features/hot-radar/lib/reddit-sync-types";
import { SubredditBoard } from "@/features/hot-radar/components/subreddit-board";

function formatCount(value: number): string {
  if (value >= 10000) {
    const text = (value / 10000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, "");
    return `${text} 万`;
  }
  return value.toLocaleString("zh-CN");
}

function formatAge(createdAt: number): string {
  if (!createdAt) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (/reddit\.com|redd\.it$/i.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function PostRow({ post, rank }: { post: ListedRedditPost; rank: number }) {
  const host = hostOf(post.url);
  return (
    <article className="flex gap-3 px-4 py-3">
      <div className="w-8 shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted-foreground">
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <a
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          className="font-medium leading-snug hover:underline"
        >
          {post.title}
        </a>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>r/{post.subreddit}</span>
          <span>u/{post.author}</span>
          <span>{formatAge(post.createdAt)}</span>
          {post.score != null ? <span>{formatCount(post.score)} 分</span> : null}
          {post.comments != null ? <span>{formatCount(post.comments)} 评论</span> : null}
          {post.flair ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">{post.flair}</span>
          ) : null}
          {post.nsfw ? <span className="text-destructive">NSFW</span> : null}
          {host ? (
            <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
              {host}
              <ArrowUpRight className="size-3" />
            </a>
          ) : null}
        </p>
      </div>
      <ExtractButton title={post.title} url={post.url} text={post.body} error={post.extractError} />
    </article>
  );
}

export function PostList({
  posts,
  empty,
}: {
  posts: ListedRedditPost[];
  empty: string;
}) {
  if (posts.length === 0) {
    return (
      <p className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="divide-y">
        {posts.map((post, index) => (
          <PostRow key={post.id} post={post} rank={index + 1} />
        ))}
      </div>
    </section>
  );
}

export function HotPosts({
  subreddit,
  posts,
  invalidSubreddit,
  sync,
  historyDays,
  historyDate,
  historyOpen,
}: {
  subreddit: string;
  posts: ListedRedditPost[];
  invalidSubreddit?: string;
  sync: RedditSyncSnapshot;
  historyDays: HistoryDay[];
  historyDate?: string;
  historyOpen?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-4 p-4 md:p-6">
      <RedditToolbar
        initial={sync}
        subreddit={subreddit}
        historyDays={historyDays}
        historyDate={historyDate}
        historyOpen={historyOpen}
      />

      <SubredditBoard subreddit={subreddit} historyDate={historyDate} />

      {invalidSubreddit ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          版块名无效。请使用 2–21 位字母、数字或下划线。
        </p>
      ) : null}

      <PostList
        posts={posts}
        empty={
          historyDate
            ? "这个板块在该期历史榜单中没有记录。"
            : sync.running
            ? "正在按板块拉取本周榜单，拉完一个就会出现在这里。"
            : "这个板块还没有存下的周榜。"
        }
      />
    </div>
  );
}
