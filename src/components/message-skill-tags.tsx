"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ScrollText, Sparkles } from "lucide-react";
import { ChatMarkdown } from "@/components/chat-markdown";
import type { RuleMessagePart, SkillMessagePart } from "@/lib/codex-types";
import { cn } from "@/lib/utils";

export function MessageLibraryTags({
  skills,
  rules,
  tone = "assistant",
  preamble,
  streamingPreamble = false,
}: {
  skills: SkillMessagePart[];
  rules?: RuleMessagePart[];
  tone?: "assistant" | "user";
  /** Model-written restatement of mounted skills/rules (folded by default). */
  preamble?: string | null;
  streamingPreamble?: boolean;
}) {
  const ruleParts = rules || [];
  const hasPreamble = Boolean(preamble?.trim());
  const [foldOpen, setFoldOpen] = useState(true);

  if (skills.length === 0 && ruleParts.length === 0 && !hasPreamble) return null;

  const chip =
    tone === "user"
      ? "inline-flex items-center gap-1 rounded-full border border-primary-foreground/25 bg-primary-foreground/12 px-2 py-0.5 text-[11px] font-medium leading-4 text-primary-foreground"
      : "inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[11px] font-medium leading-4 text-primary";

  const explanations = [
    ...skills.map((skill) => ({
      key: `skill:${skill.id}`,
      title: skill.name,
      body: skill.description?.trim() || "",
    })),
    ...ruleParts.map((rule) => ({
      key: `rule:${rule.id}`,
      title: rule.name,
      body: rule.description?.trim() || "",
    })),
  ].filter((item) => item.body);

  // Same fold control for Steward and Project Agent: model preamble preferred,
  // otherwise skill/rule descriptions — never the old details block.
  const canFold = hasPreamble || explanations.length > 0;

  return (
    <div className="mb-2 space-y-1.5" aria-label="本轮已挂载技能与规则">
      <div className="flex flex-wrap items-center gap-1.5">
        {canFold ? (
          <button
            type="button"
            aria-expanded={foldOpen}
            aria-label={foldOpen ? "折叠挂载要点" : "展开挂载要点"}
            title={foldOpen ? "折叠挂载要点" : "展开挂载要点"}
            onClick={() => setFoldOpen((open) => !open)}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors",
              tone === "user"
                ? "border-primary-foreground/25 text-primary-foreground/85 hover:bg-primary-foreground/12"
                : "border-border/80 text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
          >
            {foldOpen ? (
              <ChevronDown className="size-3.5" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden />
            )}
          </button>
        ) : null}
        {skills.map((skill) => (
          <span
            key={`skill:${skill.id}`}
            title={`已加载技能：${skill.name}`}
            className={chip}
          >
            <Sparkles className="size-3" aria-hidden />
            /{skill.command}
          </span>
        ))}
        {ruleParts.map((rule) => (
          <span
            key={`rule:${rule.id}`}
            title={`已加载规则：${rule.name}`}
            className={chip}
          >
            <ScrollText className="size-3" aria-hidden />
            {rule.name}
          </span>
        ))}
      </div>
      {foldOpen && hasPreamble ? (
        <div className="text-[12px] leading-5 text-foreground/85">
          <ChatMarkdown
            content={preamble!.trim()}
            variant="assistant"
            streaming={streamingPreamble}
          />
        </div>
      ) : null}
      {foldOpen && !hasPreamble && explanations.length > 0 ? (
        <ul className="space-y-1.5 text-[12px] leading-5 text-foreground/85">
          {explanations.map((item) => (
            <li key={item.key}>
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="text-foreground/70">：{item.body}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer MessageLibraryTags */
export function MessageSkillTags({
  skills,
  tone = "assistant",
}: {
  skills: SkillMessagePart[];
  tone?: "assistant" | "user";
}) {
  return <MessageLibraryTags skills={skills} rules={[]} tone={tone} />;
}
