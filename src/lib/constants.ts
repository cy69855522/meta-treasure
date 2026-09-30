/** Dev / production HTTP listen port */
export const APP_PORT = 1314;

/**
 * Shared agent chat column — fills the main panel width (equal side padding only).
 */
export const CHAT_COLUMN_CLASS = "mx-auto w-full";

/** Mirrored bubble width: assistant left blank ≈ user right blank within the column. */
export const CHAT_BUBBLE_MAX_CLASS = "max-w-[min(92%,100%)]";

/**
 * Max Agent / Steward Messages injected into each LLM prompt.
 * Full history stays in DB; only this many recent turns go to the model.
 */
export const AGENT_PROMPT_MESSAGE_LIMIT = 30;

/** Chat UI: initial load and each “load older” page size. */
export const CHAT_HISTORY_PAGE_SIZE = 30;

/** Done tasks per Project included in the Steward portfolio snapshot. */
export const STEWARD_DONE_HISTORY_LIMIT = 10;

/**
 * Steward dialogue rounds injected into each Project Agent system prompt
 * (1 round ≈ one user + one assistant message; limit = rounds * 2 messages).
 */
export const STEWARD_HANDOFF_ROUNDS = 3;

/** Max characters per Steward message in the Project Agent handoff excerpt. */
export const STEWARD_HANDOFF_MESSAGE_MAX_CHARS = 800;
