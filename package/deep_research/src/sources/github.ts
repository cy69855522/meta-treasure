import { GITHUB_README_CHAR_LIMIT, PAGE_EXTRACT_CHAR_LIMIT } from "../limits";
import { fetchHtml, pagePlainText } from "./html";
import {
  fallbackTitle,
  htmlChildLinks,
  markdownChildLinks,
  type PageChildLink,
  type PageExtract,
} from "./page-links";

export type GithubTarget = {
  owner: string;
  repo: string;
  kind: "repo" | "tree" | "blob" | "raw";
  ref?: string;
  path?: string;
};

const GITHUB_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)(?:\/(blob|tree)\/([^/]+)(?:\/(.*))?)?\/?(?:\?.*)?$/i;
const RAW_RE =
  /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.*)$/i;

export function parseGithubUrl(url: string): GithubTarget | null {
  const raw = url.trim();
  const rawMatch = raw.match(RAW_RE);
  if (rawMatch) {
    return {
      owner: rawMatch[1],
      repo: rawMatch[2],
      kind: "raw",
      ref: rawMatch[3],
      path: rawMatch[4],
    };
  }
  const match = raw.match(GITHUB_RE);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  if (["issues", "pulls", "actions", "wiki", "security", "pulse"].includes(repo)) {
    return null;
  }
  const kind = (match[3] as "blob" | "tree" | undefined) ?? "repo";
  return {
    owner,
    repo,
    kind,
    ref: match[4],
    path: match[5] ? match[5].replace(/\/$/, "") : undefined,
  };
}

export function githubBlobUrl(target: GithubTarget): string {
  const ref = target.ref || "HEAD";
  const path = target.path || "";
  if (!path) return `https://github.com/${target.owner}/${target.repo}`;
  return `https://github.com/${target.owner}/${target.repo}/blob/${ref}/${path}`;
}

export function githubRawUrl(target: GithubTarget): string | null {
  if (!target.path) return null;
  const ref = target.ref || "HEAD";
  return `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${ref}/${target.path}`;
}

export function sameGithubRepo(a: string, b: string): boolean {
  const left = parseGithubUrl(a);
  const right = parseGithubUrl(b);
  if (!left || !right) return false;
  return (
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.repo.toLowerCase() === right.repo.toLowerCase()
  );
}

export async function extractGithubPage(url: string): Promise<PageExtract> {
  const target = parseGithubUrl(url);
  if (!target) {
    return { url, title: fallbackTitle(url), text: "", links: [] };
  }
  if (target.kind === "blob" || target.kind === "raw") {
    return extractGithubBlob(target, url);
  }
  return extractGithubTree(target, url);
}

async function extractGithubBlob(
  target: GithubTarget,
  original: string,
): Promise<PageExtract> {
  const blob = githubBlobUrl(target);
  const raw = githubRawUrl(target);
  const title = fallbackTitle(blob);
  if (!raw) {
    return { url: blob, title, text: "", links: [] };
  }
  try {
    const res = await fetch(raw, {
      headers: { Accept: "text/plain", "User-Agent": "DeepRadar/0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const text = (await res.text()).slice(0, PAGE_EXTRACT_CHAR_LIMIT);
    return {
      url: blob,
      finalUrl: raw,
      title,
      text,
      links: markdownChildLinks(text, blob),
    };
  } catch {
    try {
      const { html, finalUrl } = await fetchHtml(blob, { timeoutMs: 15_000 });
      return {
        url: blob,
        finalUrl,
        title,
        text: pagePlainText(html),
        links: htmlChildLinks(html, blob).filter((link) =>
          parseGithubUrl(link.url),
        ),
      };
    } catch {
      return { url: original, title, text: "", links: [] };
    }
  }
}

async function extractGithubTree(
  target: GithubTarget,
  original: string,
): Promise<PageExtract> {
  const htmlUrl = target.ref
    ? `https://github.com/${target.owner}/${target.repo}/tree/${target.ref}${
        target.path ? `/${target.path}` : ""
      }`
    : `https://github.com/${target.owner}/${target.repo}`;
  const title = target.path
    ? `${target.owner}/${target.repo}/${target.path}`
    : `${target.owner}/${target.repo}`;
  let html = "";
  let finalUrl = htmlUrl;
  try {
    const fetched = await fetchHtml(htmlUrl, { timeoutMs: 15_000 });
    html = fetched.html;
    finalUrl = fetched.finalUrl || htmlUrl;
  } catch {
    html = "";
  }
  const listing = html
    ? htmlChildLinks(html, finalUrl, 40).filter((link) =>
        sameGithubRepo(link.url, htmlUrl),
      )
    : [];
  const readme = await fetchGithubReadme(target);
  const listingText = listing
    .map((link) => `- ${link.title} ${link.url}`)
    .join("\n");
  const text = [readme, listingText ? `子页面：\n${listingText}` : ""]
    .filter((part) => part.trim())
    .join("\n\n")
    .slice(0, PAGE_EXTRACT_CHAR_LIMIT);
  const links = mergeLinks(listing, markdownChildLinks(readme, githubBlobUrl({
    ...target,
    kind: "blob",
    ref: target.ref || "HEAD",
    path: readmePath(target.path),
  })));
  return {
    url: original,
    finalUrl,
    title,
    text: text || `${title}（未能读取仓库目录）`,
    links,
  };
}

function readmePath(dir?: string): string {
  return dir ? `${dir.replace(/\/$/, "")}/README.md` : "README.md";
}

async function fetchGithubReadme(target: GithubTarget): Promise<string> {
  const names = ["README.md", "readme.md", "README.rst", "README.txt"];
  const prefix = target.path ? `${target.path.replace(/\/$/, "")}/` : "";
  const refs = [target.ref, "HEAD", "main", "master"].filter(
    (value, index, all): value is string =>
      Boolean(value) && all.indexOf(value) === index,
  );
  for (const ref of refs) {
    for (const name of names) {
      const raw = `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${ref}/${prefix}${name}`;
      try {
        const res = await fetch(raw, {
          headers: { Accept: "text/plain", "User-Agent": "DeepRadar/0.1" },
          redirect: "follow",
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const text = (await res.text()).trim();
        if (text.length > 20) return text.slice(0, GITHUB_README_CHAR_LIMIT);
      } catch {
        // try next
      }
    }
  }
  return "";
}

function mergeLinks(
  ...lists: PageChildLink[][]
): PageChildLink[] {
  const seen = new Set<string>();
  const out: PageChildLink[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
  }
  return out.slice(0, 40);
}
