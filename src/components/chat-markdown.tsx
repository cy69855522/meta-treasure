"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  variant?: "user" | "assistant";
  className?: string;
  /** While tokens arrive, skip markdown to avoid incomplete AST reflow jitter. */
  streaming?: boolean;
};

/** Markdown collapses lone newlines; turn them into hard breaks for chat. */
function withHardLineBreaks(content: string): string {
  return content.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

/**
 * Models often paste WeChat/HTML fragments. react-markdown does not render raw
 * HTML by default, so `<br>` shows literally and `<s>3000</s>` can collapse or
 * look like glued digits. Convert a small safe subset to Markdown first.
 * (Avoid blanket tag-stripping — it breaks fenced code samples.)
 */
function normalizeChatContent(content: string): string {
  let s = content;

  // Line breaks (also HTML entities models sometimes emit)
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  s = s.replace(/&lt;br\s*\/?\s*&gt;/gi, "\n");

  // Strikethrough tags → GFM ~~…~~
  s = s.replace(
    /<(?:del|s|strike)\b[^>]*>([\s\S]*?)<\/(?:del|s|strike)>/gi,
    (_, inner: string) => `~~${inner}~~`,
  );

  // Common rich-text / WeChat inline line-through
  s = s.replace(
    /<span\b[^>]*style=["'][^"']*text-decoration:\s*line-through[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    (_, inner: string) => `~~${inner}~~`,
  );

  return withHardLineBreaks(s);
}

const remarkPlugins = [remarkGfm];

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  br: () => <br />,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-2 text-lg font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 text-base font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 text-base font-semibold">{children}</h3>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-muted-foreground/80">{children}</del>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-current/30 pl-3 opacity-90 last:mb-0">
      {children}
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
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-current/20 px-2 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-current/20 px-2 py-1">{children}</td>
  ),
  hr: () => <hr className="my-3 border-current/20" />,
};

function ChatMarkdownInner({
  content,
  variant = "assistant",
  className,
  streaming = false,
}: Props) {
  const isUser = variant === "user";
  const tone = isUser
    ? "[&_a]:text-primary-foreground [&_a]:underline [&_code]:bg-primary-foreground/15 [&_pre]:bg-primary-foreground/10"
    : "[&_a]:text-primary [&_a]:underline [&_code]:bg-background/70 [&_pre]:bg-background/80";

  if (streaming) {
    return (
      <div
        className={cn(
          "chat-md text-base leading-relaxed break-words whitespace-pre-wrap",
          className,
        )}
      >
        {normalizeChatContent(content)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "chat-md text-base leading-relaxed break-words",
        tone,
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={markdownComponents}
      >
        {normalizeChatContent(content)}
      </ReactMarkdown>
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownInner);
