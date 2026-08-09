"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import type { Skill, SkillFolder } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChatMarkdown } from "@/components/chat-markdown";

const DEFAULT_BODY = `# Skill Title

## When to use

Describe trigger scenarios.

## Instructions

1. Step one
2. Step two
`;

export function SkillFolderView({
  folder,
  initialSkills,
}: {
  folder: SkillFolder;
  initialSkills: Skill[];
}) {
  const router = useRouter();
  const [skills, setSkills] = useState(initialSkills);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [preview, setPreview] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setBody(DEFAULT_BODY);
    setPreview(false);
    setEditorOpen(true);
  }

  function openEdit(skill: Skill) {
    setEditing(skill);
    setName(skill.name);
    setDescription(skill.description);
    setBody(skill.body);
    setPreview(false);
    setEditorOpen(true);
  }

  async function saveSkill(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/skills/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, body }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || "保存失败");
        }
        const data = (await res.json()) as { skill: Skill };
        setSkills((prev) =>
          prev
            .map((s) => (s.id === data.skill.id ? data.skill : s))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        const res = await fetch(`/api/skill-folders/${folder.id}/skills`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, body }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || "创建失败");
        }
        const data = (await res.json()) as { skill: Skill };
        setSkills((prev) =>
          [...prev, data.skill].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      setEditorOpen(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeSkill(skill: Skill) {
    if (!confirm(`删除技能「${skill.name}」？`)) return;
    const res = await fetch(`/api/skills/${skill.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "删除失败");
      return;
    }
    setSkills((prev) => prev.filter((s) => s.id !== skill.id));
    router.refresh();
  }

  const previewMarkdown = `---
name: ${name.trim() || "skill-name"}
description: >-
  ${description.trim() || "Brief description of when to use this skill."}
---

${body}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/skills"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            返回技能库
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {folder.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {skills.length} 个技能 · 标准 SKILL.md 写法
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus />
          新建技能
        </Button>
      </header>

      {skills.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
          这个文件夹还是空的。新建一个 Skill，写上 name / description 和正文。
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{skill.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {skill.description || "（无 description）"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="编辑"
                  onClick={() => openEdit(skill)}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="删除"
                  onClick={() => removeSkill(skill)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑技能" : "新建技能"}</DialogTitle>
            <DialogDescription>
              对应 Cursor Agent Skill：YAML frontmatter 的 name / description，加
              markdown 正文。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveSkill} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              name
              <Input
                autoFocus
                placeholder="kebab-case-skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              description（何时启用）
              <Textarea
                className="min-h-20"
                placeholder="Use when the user asks to…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">正文（markdown）</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPreview((v) => !v)}
              >
                {preview ? "编辑" : "预览 SKILL.md"}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-64 rounded-lg border bg-muted/20 px-4 py-3">
                <ChatMarkdown content={previewMarkdown} />
              </div>
            ) : (
              <Textarea
                className="min-h-64 font-mono text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={DEFAULT_BODY}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditorOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
