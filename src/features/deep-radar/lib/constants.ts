export const MAX_GRILL_QUESTIONS = 5;
export const DEFAULT_MAX_ROUNDS = 6;
export const CHAT_POLL_MS = 800;
export const FILTER_HIT_LIMIT = 48;
export const SNIPPET_CHAR_LIMIT = 800;
export const EXTRACT_CHAR_LIMIT = 32_000;
export const EXPLORE_MAX_BATCHES = 100;
export const EXPLORE_MAX_URLS_PER_BATCH = 32;
export const EXPLORE_CHILD_LINK_LIMIT = 64;
export const REPORT_WRITE_MAX_TURNS = 32;
export const REPORT_WORKSPACE_EXTRACT_LIMIT = 80_000;
/** Max per-file source bodies seeded into the report workspace. */
export const REPORT_WORKSPACE_MAX_SOURCES = 48;
/** Cap each round summary/analysis inside research.json for writing. */
export const REPORT_WORKSPACE_ROUND_TEXT_LIMIT = 2_500;
/** Minimum body length before a report counts as a finished Deep Research deliverable. */
export const REPORT_MIN_CHARS = 1_500;
export const MAX_SETTINGS_ROUNDS = 15;
/** How many source bodies the LLM may open per read_sources call. */
export const READ_SOURCES_MAX_PER_BATCH = 4;
/** Max read_sources rounds inside findings / report-plan tool loops. */
export const READ_SOURCES_MAX_BATCHES = 32;
/** Per-source body size when returned via read_sources. */
export const READ_SOURCES_BODY_LIMIT = 24_000;

export const SKIP_OUTLINE_RE =
  /直接出纲要|不用再问|就这样出|出纲要吧|不用问了|跳过追问/;
