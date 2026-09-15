import { Sparkles } from "lucide-react";
import type { SkillMessagePart } from "@/lib/codex-types";

export function MessageSkillTags({
  skills,
  tone = "assistant",
}: {
  skills: SkillMessagePart[];
  tone?: "assistant" | "user";
}) {
  if (skills.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5" aria-label="本轮已调用技能">
      {skills.map((skill) => (
        <span
          key={skill.id}
          title={`已加载技能：${skill.name}`}
          className={
            tone === "user"
              ? "inline-flex items-center gap-1 rounded-full border border-primary-foreground/25 bg-primary-foreground/12 px-2 py-0.5 text-[11px] font-medium leading-4 text-primary-foreground"
              : "inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[11px] font-medium leading-4 text-primary"
          }
        >
          <Sparkles className="size-3" aria-hidden />
          /{skill.command}
        </span>
      ))}
    </div>
  );
}
