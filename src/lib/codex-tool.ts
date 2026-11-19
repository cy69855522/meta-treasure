import type { z } from "zod";

export type ToolExecutionOptions = {
  toolCallId: string;
  messages: unknown[];
  context?: unknown;
};

/**
 * What the chat should show for a tool call. The Codex service renders this
 * generically and knows nothing about individual tools.
 */
export type ToolPresentation = {
  skill?: { id: string; name: string; command: string; description?: string };
  rule?: { id: string; name: string; description?: string };
  search?: {
    id: string;
    query?: string;
    sources?: string[];
    hits?: Array<{ id: string; source: string; title: string; url: string; snippet?: string }>;
    pages?: Array<{ url: string; title: string; source?: string; text: string; error?: string }>;
    status?: "searching" | "fetching" | "done" | "error";
    phase?: "search" | "fetch" | "visit";
    error?: string;
  };
  radar?: { sessionId: string; title: string; url: string; reportUrl: string };
};

export type ToolCallContext = { callId: string };

export type CodexTool = {
  description: string;
  inputSchema: z.ZodType;
  /** Runs without asking the user. Declared on the tool, never in a central list. */
  autoApprove?: boolean;
  execute?: (...args: never[]) => unknown | Promise<unknown>;
  /** Progress shown while the call runs. */
  begin?: (input: never, context: ToolCallContext) => ToolPresentation | undefined;
  /** Result shown once the call succeeded. */
  present?: (input: never, output: never, context: ToolCallContext) => ToolPresentation | undefined;
};

export type ToolSet = Record<string, CodexTool>;

export function tool<TSchema extends z.ZodType, TOutput = unknown>(definition: {
  description: string;
  inputSchema: TSchema;
  autoApprove?: boolean;
  execute?: (
    input: z.output<TSchema>,
    options: ToolExecutionOptions,
  ) => TOutput | Promise<TOutput>;
  begin?: (input: z.output<TSchema>, context: ToolCallContext) => ToolPresentation | undefined;
  present?: (
    input: z.output<TSchema>,
    output: Awaited<TOutput>,
    context: ToolCallContext,
  ) => ToolPresentation | undefined;
}): CodexTool {
  return definition as unknown as CodexTool;
}
