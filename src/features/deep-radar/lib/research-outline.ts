import type { Outline, OutlineSubquestion } from "@/features/deep-radar/lib/research-types";

export function outlinePoints(outline: Outline | null | undefined): string[] {
  if (!outline) return [];
  const fromNew = (outline.objectives ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromNew.length > 0) return fromNew;
  return (outline.subquestions ?? [])
    .map((item) => pointFromLegacy(item))
    .filter(Boolean);
}

function pointFromLegacy(item: OutlineSubquestion): string {
  const question = item.question.trim();
  const extra = (item.searchDirections ?? [])
    .map((row) => row.trim())
    .filter((row) => row && row !== question);
  if (!question) return extra.join("；");
  if (extra.length === 0) return question;
  return `${question}：${extra.join("；")}`;
}

export function normalizeOutline(raw: unknown): Outline {
  const row = (raw ?? {}) as Partial<Outline> & {
    objectives?: unknown;
    subquestions?: unknown;
    exclusions?: unknown;
    goal?: unknown;
  };
  const objectives = Array.isArray(row.objectives)
    ? row.objectives
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const subquestions = Array.isArray(row.subquestions)
    ? (row.subquestions as OutlineSubquestion[])
        .filter((item) => item && typeof item.question === "string")
        .map((item) => ({
          question: item.question.trim(),
          searchDirections: Array.isArray(item.searchDirections)
            ? item.searchDirections.map((dir) => String(dir).trim()).filter(Boolean)
            : [],
        }))
    : [];
  const exclusions = Array.isArray(row.exclusions)
    ? row.exclusions
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const goal = typeof row.goal === "string" ? row.goal.trim() : "";
  const outline: Outline = {
    goal,
    objectives:
      objectives.length > 0
        ? objectives
        : subquestions.map(pointFromLegacy).filter(Boolean),
    exclusions,
  };
  if (subquestions.length > 0) outline.subquestions = subquestions;
  return outline;
}
