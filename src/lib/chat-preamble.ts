/**
 * Models often restate mounted skills/rules as a short bullet list before `---`.
 * Split that preamble so the UI can collapse it under the library tags.
 * The markdown divider is kept on the body so the bubble still shows the line.
 */
export function splitMountedPreamble(
  text: string,
  mountedNames: string[],
  options?: { allowPending?: boolean },
): { preamble: string | null; body: string } {
  const trimmed = text.trimStart();
  if (!trimmed) return { preamble: null, body: text };

  const names = mountedNames
    .map((name) => name.trim().replace(/^\//, ""))
    .filter(Boolean);
  if (names.length === 0) return { preamble: null, body: text };

  const divider = trimmed.match(/\r?\n[ \t]*---[ \t]*\r?\n/);
  if (divider && divider.index !== undefined) {
    const head = trimmed.slice(0, divider.index).trim();
    const body = trimmed.slice(divider.index + divider[0].length).trimStart();
    if (!head || !body) return { preamble: null, body: text };
    if (!isLibraryPreamble(head, names)) return { preamble: null, body: text };
    return { preamble: head, body: `---\n\n${body}` };
  }

  // No markdown hr: still fold a leading skill/rule restatement before the real answer.
  const blankSplit = trimmed.match(/^([\s\S]*?)\r?\n[ \t]*\r?\n([\s\S]+)$/);
  if (blankSplit) {
    const head = blankSplit[1].trim();
    const body = blankSplit[2].trimStart();
    if (head && body && isLibraryPreamble(head, names)) {
      return { preamble: head, body: `---\n\n${body}` };
    }
  }

  // Streaming: whole chunk so far is only the list — keep it collapsed, no body yet.
  if (options?.allowPending && isLibraryPreamble(trimmed, names)) {
    return { preamble: trimmed.trim(), body: "" };
  }

  return { preamble: null, body: text };
}

function isLibraryPreamble(head: string, names: string[]): boolean {
  const headLower = head.toLocaleLowerCase();
  const matched = names.filter((name) =>
    headLower.includes(name.toLocaleLowerCase()),
  );
  if (matched.length === 0) return false;

  const lines = head.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > Math.max(10, names.length * 3)) {
    return false;
  }
  if (head.length > 1600) return false;

  // Prefer list / short restatement blocks, not a full answer.
  const listLike = lines.filter(
    (line) =>
      /^[-*•·◦▪▸►]/.test(line) ||
      /^\d+[.)]/.test(line) ||
      /^\*\*[^*]+\*\*/.test(line),
  ).length;
  return listLike >= 1 && listLike >= lines.length * 0.4;
}
