import type { z } from "zod";

export type ToolExecutionOptions = {
  toolCallId: string;
  messages: unknown[];
  context?: unknown;
};

export type CodexTool = {
  description: string;
  inputSchema: z.ZodType;
  execute?: (...args: never[]) => unknown | Promise<unknown>;
};

export type ToolSet = Record<string, CodexTool>;

export function tool<TSchema extends z.ZodType>(definition: {
  description: string;
  inputSchema: TSchema;
  execute?: (
    input: z.output<TSchema>,
    options: ToolExecutionOptions,
  ) => unknown | Promise<unknown>;
}): CodexTool {
  return definition as unknown as CodexTool;
}
