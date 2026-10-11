"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  memo,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  candyClassFor,
  extractEqualsMarks,
  mergeKeywords,
  splitByKeywords,
} from "@/features/deep-radar/lib/candy-highlight";
import { autolinkBareUrls, displayCiteLabel, resolveReportLink } from "@/features/deep-radar/lib/cite-links";
import { citeChipClassName, CiteTag } from "@/features/deep-radar/components/cite-tag";
import type { ResearchLink } from "@/features/deep-radar/lib/research-types";
import {
  normalizeChatContent,
  normalizeStreamingChatContent,
  remarkSafeBreaks,
} from "@/lib/chat-markdown-normalize";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  variant?: "user" | "assistant";
  className?: string;
  /** While tokens arrive, skip markdown to avoid incomplete AST reflow jitter. */
  streaming?: boolean;
  /** Candy-color keyword highlights; original bold/italic stay. */
  keywords?: string[];
  /** Turn markdown links into inline citation tags. */
  citeCatalog?: ResearchLink[];
};

const remarkPlugins = [remarkGfm, remarkSafeBreaks];

const SKIP_HIGHLIGHT = new Set(["a", "code", "pre", "mark", "CiteTag"]);

function markdownNodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(markdownNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return markdownNodeText(node.props.children);
  }
  return "";
}

function paintKeywords(node: ReactNode, keywords: string[]): ReactNode {
  if (!keywords.length || node == null || typeof node === "boolean") return node;
  if (typeof node === "string" || typeof node === "number") {
    const pieces = splitByKeywords(String(node), keywords);
    if (pieces.length === 1 && !pieces[0]?.hit) return String(node);
    return pieces.map((piece, index) =>
      piece.hit ? (
        <mark
          key={`${piece.hit}-${index}`}
          className={cn(
            "rounded-[0.2em] px-0.5 py-px [box-decoration-break:clone]",
            candyClassFor(piece.hit),
          )}
        >
          {piece.text}
        </mark>
      ) : (
        piece.text
      ),
    );
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) => paintKeywords(child, keywords));
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const type = node.type;
    const name =
      typeof type === "string"
        ? type
        : ((type as { displayName?: string; name?: string }).displayName ??
          (type as { name?: string }).name ??
          "");
    if (SKIP_HIGHLIGHT.has(name)) return node;
    if (node.props.children == null) return node;
    return cloneElement(node, undefined, paintKeywords(node.props.children, keywords));
  }
  return node;
}

function markdownComponents(
  keywords: string[],
  citeCatalog?: ResearchLink[],
): Components {
  const paint = (children: ReactNode) => paintKeywords(children, keywords);
  return {
    p: ({ children }) => <p className="mb-2 last:mb-0">{paint(children)}</p>,
    br: () => <br />,
    ul: ({ children }) => (
      <ul className="mb-2 list-disc space-y-1 pl-6 last:mb-0">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-2 list-decimal space-y-1 pl-6 last:mb-0">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{paint(children)}</li>,
    h1: ({ children }) => (
      <h1 className="mb-2 text-lg font-semibold">{paint(children)}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-2 text-base font-semibold">{paint(children)}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-1.5 text-base font-semibold">{paint(children)}</h3>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => (
      <del className="text-muted-foreground/80">{children}</del>
    ),
    a: ({ href, children }) => {
      if (!href) return <>{children}</>;
      if (citeCatalog) {
        return (
          <CiteTag href={href} catalog={citeCatalog}>
            {children}
          </CiteTag>
        );
      }
      const link = resolveReportLink(href, []);
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          title={link.title}
          className={citeChipClassName}
        >
          {displayCiteLabel(markdownNodeText(children), link)}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="mb-2 border-l-2 border-current/30 pl-3 opacity-90 last:mb-0">
        {paint(children)}
      </blockquote>
    ),
    code: ({ className: codeClassName, children, ...props }) => {
      const isBlock = Boolean(codeClassName?.includes("language-"));
      if (!isBlock) {
        return (
          <code
            className="rounded px-1 py-0.5 font-mono text-[0.85em]"
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={cn("font-mono text-[0.85em]", codeClassName)} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="mb-2 overflow-x-auto rounded-lg p-3 last:mb-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="mb-2 overflow-x-auto last:mb-0">
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-current/20 px-2 py-1 font-semibold">
        {paint(children)}
      </th>
    ),
    td: ({ children }) => (
      <td className="break-words border border-current/20 px-2 py-1 align-top">
        {paint(children)}
      </td>
    ),
    hr: () => <hr className="my-3 border-current/20" />,
  };
}

function sameKeywords(a?: string[], b?: string[]) {
  if (a === b) return true;
  if (!a?.length && !b?.length) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameCiteCatalog(a?: ResearchLink[], b?: ResearchLink[]) {
  if (a === b) return true;
  if (!a?.length && !b?.length) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left?.url !== right?.url ||
      left?.title !== right?.title ||
      left?.source !== right?.source
    ) {
      return false;
    }
  }
  return true;
}

function chatMarkdownPropsEqual(prev: Props, next: Props) {
  return (
    prev.content === next.content &&
    prev.variant === next.variant &&
    prev.className === next.className &&
    prev.streaming === next.streaming &&
    sameKeywords(prev.keywords, next.keywords) &&
    sameCiteCatalog(prev.citeCatalog, next.citeCatalog)
  );
}

function ChatMarkdownInner({
  content,
  variant = "assistant",
  className,
  streaming = false,
  keywords,
  citeCatalog,
}: Props) {
  const isUser = variant === "user";
  const tone = isUser
    ? "[&_a]:text-primary-foreground [&_a]:no-underline [&_code]:bg-primary-foreground/15 [&_pre]:bg-primary-foreground/10"
    : "[&_a]:no-underline [&_code]:bg-background/70 [&_pre]:bg-background/80";
  const marks = extractEqualsMarks(content);
  const terms = mergeKeywords(keywords, marks.marks);
  const body = marks.text;

  if (streaming) {
    return (
      <div
        className={cn(
          "chat-md text-base leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
          className,
        )}
      >
        {normalizeStreamingChatContent(autolinkBareUrls(body))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "chat-md text-base leading-relaxed break-words [overflow-wrap:anywhere]",
        tone,
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={markdownComponents(terms, citeCatalog)}
      >
        {normalizeChatContent(autolinkBareUrls(body))}
      </ReactMarkdown>
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownInner, chatMarkdownPropsEqual);
