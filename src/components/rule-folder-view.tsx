"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import type { Rule, RuleFolder } from "@/lib/types";
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

const DEFAULT_BODY = `# Rule Title

## Constraints

- Prefer X over Y
- Always / never …

## Examples

Brief good vs bad examples when helpful.
`;

export function RuleFolderView({
  folder,
  initialRules,
}: {
  folder: RuleFolder;
  initialRules: Rule[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
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

  function openEdit(rule: Rule) {
    setEditing(rule);
    setName(rule.name);
    setDescription(rule.description);
    setBody(rule.body);
    setPreview(false);
    setEditorOpen(true);
  }

  async function saveRule(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/rules/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, body }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || "保存失败");
        }
        const data = (await res.json()) as { rule: Rule };
        setRules((prev) =>
          prev
            .map((r) => (r.id === data.rule.id ? data.rule : r))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        const res = await fetch(`/api/rule-folders/${folder.id}/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, body }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || "创建失败");
        }
        const data = (await res.json()) as { rule: Rule };
        setRules((prev) =>
          [...prev, data.rule].sort((a, b) => a.name.localeCompare(b.name)),
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

  async function removeRule(rule: Rule) {
    if (!confirm(`删除规则「${rule.name}」？`)) return;
    const res = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const data = (await res.json()) as { error?: string };
      alert(data.error || "删除失败");
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    router.refresh();
  }

  const previewMarkdown = `---
name: ${name.trim() || "rule-name"}
description: >-
  ${description.trim() || "Brief description of when this rule applies."}
---

${body}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/rules"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            返回规则库
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {folder.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rules.length} 条规则 · 持久约束（非流程型 Skill）
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus />
          新建规则
        </Button>
      </header>

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
          这个文件夹还是空的。新建一条 Rule，写上适用场景与必须遵守的约束。
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{rule.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {rule.description || "（无 description）"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="编辑"
                  onClick={() => openEdit(rule)}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="删除"
                  onClick={() => removeRule(rule)}
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
            <DialogTitle>{editing ? "编辑规则" : "新建规则"}</DialogTitle>
            <DialogDescription>
              对齐 Cursor Rules：持续生效的约束与偏好。Skill 是可按需调用的流程；Rule
              是「做事时始终遵守」的规范。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveRule} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              name
              <Input
                autoFocus
                placeholder="frontend-conventions"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              description（适用场景）
              <Textarea
                className="min-h-20"
                placeholder="Apply when working on frontend / React / UI…"
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
                {preview ? "编辑" : "预览 RULE.md"}
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
