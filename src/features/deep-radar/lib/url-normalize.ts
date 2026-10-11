const TRACKING_PREFIXES = [
  "utm_",
  "spm",
  "from",
  "scene",
  "clicktime",
  "ascene",
  "chksm",
  "mpshare",
  "srcid",
  "wd",
  "exportkey",
  "nsukey",
];

const KEEP_WECHAT = new Set(["__biz", "mid", "idx", "sn", "chksm"]);

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let href = trimmed;
  if (href.startsWith("http://mp.weixin.qq.com")) {
    href = `https://${href.slice("http://".length)}`;
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return trimmed.toLowerCase();
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.protocol = url.protocol.toLowerCase();
  if (url.pathname.endsWith("/") && url.pathname.length > 1) {
    url.pathname = url.pathname.slice(0, -1);
  }

  const isWechat = url.hostname.endsWith("weixin.qq.com");
  const next = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (isWechat) {
      if (KEEP_WECHAT.has(lower) || KEEP_WECHAT.has(key)) {
        next.set(key, value);
      }
      return;
    }
    if (TRACKING_PREFIXES.some((p) => lower === p || lower.startsWith(p))) {
      return;
    }
    next.set(key, value);
  });
  url.search = next.toString();
  return url.toString();
}

export function titleKey(title: string): string {
  return title.replace(/\s+/g, "").toLowerCase();
}
