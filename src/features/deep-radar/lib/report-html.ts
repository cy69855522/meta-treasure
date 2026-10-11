/** Standalone HTML export for a research report (fullscreen reading layout). */

export function reportDisplayTitle(report: {
  markdown?: string;
  conclusions?: Array<{ headline?: string }>;
}): string {
  const md = report.markdown?.trim() ?? "";
  const heading = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const first = report.conclusions?.find((item) => item.headline?.trim())?.headline;
  return first?.trim() || "研究报告";
}

export function reportDownloadFilename(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${safe || "研究报告"}.html`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Self-contained page CSS — mirrors the fullscreen full-bleed reader. */
const REPORT_EXPORT_CSS = `
:root {
  color-scheme: light;
  --fg: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --chip-bg: #f0f9ff;
  --chip-fg: #0c4a6e;
  --chip-ring: #7dd3fc;
  --mark-bg: #fef08a;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: var(--fg);
  font-family: "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
    system-ui, -apple-system, sans-serif;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(8px);
}
.topbar .brand {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.topbar h1 {
  margin: 0.15rem 0 0;
  font-size: 1rem;
  font-weight: 600;
}
.meta {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
  white-space: nowrap;
}
.page {
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}
@media (min-width: 768px) {
  .topbar { padding-left: 2rem; padding-right: 2rem; }
  .page { padding-left: 2rem; padding-right: 2rem; }
}
.report {
  width: 100%;
  max-width: 100%;
  font-size: 1.05rem;
  line-height: 1.8;
}
.report > :first-child { margin-top: 0; }
.report h1 {
  margin: 0 0 1.25rem;
  font-size: clamp(1.6rem, 2.4vw, 2.15rem);
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.report h2 {
  margin: 2rem 0 0.75rem;
  font-size: 1.35rem;
  line-height: 1.3;
  font-weight: 650;
}
.report h3 {
  margin: 1.5rem 0 0.55rem;
  font-size: 1.15rem;
  font-weight: 600;
}
.report p { margin: 0 0 0.9rem; }
.report ul, .report ol {
  margin: 0 0 0.9rem;
  padding-left: 1.4rem;
}
.report li { margin: 0.2rem 0; }
.report blockquote {
  margin: 0 0 0.9rem;
  padding: 0.15rem 0 0.15rem 0.9rem;
  border-left: 3px solid #a1a1aa;
  color: #3f3f46;
}
.report pre {
  margin: 0 0 0.9rem;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  border-radius: 0.6rem;
  background: #f4f4f5;
  font-size: 0.9em;
}
.report code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
.report :not(pre) > code {
  padding: 0.1em 0.35em;
  border-radius: 0.3em;
  background: #f4f4f5;
}
.report table {
  width: 100%;
  margin: 0 0 1rem;
  border-collapse: collapse;
  font-size: 0.95em;
}
.report th, .report td {
  border: 1px solid var(--border);
  padding: 0.45rem 0.65rem;
  text-align: left;
  vertical-align: top;
}
.report th { background: #fafafa; font-weight: 600; }
.report hr {
  margin: 1.5rem 0;
  border: 0;
  border-top: 1px solid var(--border);
}
.report mark {
  background: var(--mark-bg);
  border-radius: 0.2em;
  padding: 0 0.15em;
}
.report a,
.report button {
  color: var(--chip-fg);
  text-decoration: none;
}
/* Cite chips rendered as buttons in the app */
.report button {
  display: inline-flex;
  align-items: center;
  max-width: 6rem;
  margin: 0 0.15em;
  padding: 0 0.45em;
  border: 0;
  border-radius: 2px;
  background: var(--chip-bg);
  box-shadow: inset 0 0 0 1px var(--chip-ring);
  font: inherit;
  font-size: 0.8em;
  font-weight: 500;
  line-height: 1.4;
  vertical-align: middle;
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`.trim();

export function buildReportHtmlDocument(options: {
  title: string;
  bodyHtml: string;
  exportedAt?: Date;
}): string {
  const title = options.title.trim() || "研究报告";
  const when = (options.exportedAt ?? new Date()).toLocaleString("zh-CN", {
    hour12: false,
  });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="Deep Radar" />
<title>${escapeHtml(title)}</title>
<style>
${REPORT_EXPORT_CSS}
</style>
</head>
<body>
  <header class="topbar">
    <div>
      <p class="brand">Deep Radar</p>
      <h1>${escapeHtml(title)}</h1>
    </div>
    <p class="meta">导出于 ${escapeHtml(when)}</p>
  </header>
  <main class="page">
    <article class="report">
${options.bodyHtml}
    </article>
  </main>
</body>
</html>
`;
}

export function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
