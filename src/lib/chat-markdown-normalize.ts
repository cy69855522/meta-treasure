type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
};

/** Markdown collapses lone newlines; turn them into hard breaks for chat. */
function withHardLineBreaks(content: string): string {
  return content.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

/**
 * Normalize the small safe subset of HTML that models commonly emit.
 * Keep `<br>` inline until after GFM tables are parsed: a literal newline here
 * would split one table row into several malformed rows.
 */
export function normalizeChatContent(content: string): string {
  let normalized = content.replace(/&lt;br\s*\/?\s*&gt;/gi, "<br>");

  normalized = normalized.replace(
    /<(?:del|s|strike)\b[^>]*>([\s\S]*?)<\/(?:del|s|strike)>/gi,
    (_, inner: string) => `~~${inner}~~`,
  );

  normalized = normalized.replace(
    /<span\b[^>]*style=["'][^"']*text-decoration:\s*line-through[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
    (_, inner: string) => `~~${inner}~~`,
  );

  return withHardLineBreaks(normalized);
}

/** Plain-text streaming has no Markdown AST, so line breaks can be literal. */
export function normalizeStreamingChatContent(content: string): string {
  return normalizeChatContent(content).replace(/<br\s*\/?\s*>/gi, "\n");
}

/** Convert only standalone HTML line-break nodes into Markdown break nodes. */
export function remarkSafeBreaks() {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === "html" && /^<br\s*\/?\s*>$/i.test(child.value ?? "")) {
          return { type: "break" };
        }
        visit(child);
        return child;
      });
    }

    visit(tree);
  };
}
