export type RedditSyncSnapshot = {
  running: boolean;
  phase: "boards" | "texts";
  current: string | null;
  index: number;
  total: number;
  waitSeconds: number | null;
  lastFinishedAt: number | null;
  postCount: number;
};
