export function skillCommandName(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

export function normalizeSkillCommand(value: string): string {
  return value.trim().replace(/_/g, " ").toLocaleLowerCase();
}

export function extractSkillCommands(text: string): string[] {
  return [...text.matchAll(/(?:^|\s)\/([^\s/]+)/g)].map((match) => match[1]);
}

export function activeSkillCommand(text: string, cursor: number): { slash: number; query: string } | null {
  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;
  return { slash: beforeCursor.lastIndexOf("/"), query: match[1] };
}
