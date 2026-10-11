"use client";

import { Check, LoaderCircle, Settings2, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { ActionDiffList } from "@/components/action-diff-list";
import type { CodexModelOption, CodexRequest, CodexState } from "@/lib/codex-types";
import type { ActionAffects } from "@/lib/agent-tools-types";
import { cn } from "@/lib/utils";

type Props = {
  state?: CodexState;
  action: (body: object) => Promise<CodexState>;
  onApplied?: (affects: ActionAffects) => void;
};

type SettingsProps = {
  state?: CodexState;
  action: (body: object) => Promise<CodexState>;
  modelOptions: CodexModelOption[];
  onModelChange: (modelId: string) => Promise<void>;
};

const buttonClass = "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

function requestTitle(request: CodexRequest): string {
  if (request.method === "item/tool/call") return request.preview?.actionLabel || "项目操作确认";
  if (request.method.includes("UserInput")) return "需要补充信息";
  return "操作确认";
}

export function CodexSettings({ state, action, modelOptions, onModelChange }: SettingsProps) {
  const currentModelId = state?.modelId && modelOptions.some((option) => option.id === state.modelId) ? state.modelId : modelOptions[0]?.id || "";
  const [open, setOpen] = useState(false);
  const [cwd, setCwd] = useState("");
  const [modelId, setModelId] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = state?.status === "submitted" || state?.status === "streaming";
  const selectedOption =
    modelOptions.find((option) => option.id === modelId) ||
    modelOptions.find((option) => option.id === currentModelId) ||
    modelOptions[0];

  function show() {
    setCwd(state?.cwd || "");
    setModelId(currentModelId);
    setOpen(true);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      if (cwd.trim() && cwd.trim() !== state?.cwd) await action({ action: "directory", cwd: cwd.trim() });
      if (modelId && modelId !== currentModelId) await onModelChange(modelId);
      setOpen(false);
    }
    catch { /* The shared chat error banner shows the validation message. */ }
    finally { setSaving(false); }
  }

  return (
    <>
      <button type="button" className={cn(buttonClass, "bg-background")} disabled={busy} onClick={show}>
        <Settings2 className="size-3.5" />配置
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="w-full max-w-lg rounded-2xl border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="codex-settings-title">
            <header className="flex items-center justify-between border-b px-5 py-4">
              <div><h2 id="codex-settings-title" className="text-sm font-semibold">Agent 配置</h2><p className="mt-1 text-xs text-muted-foreground">设置只读代码目录和对话模型。</p></div>
              <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" onClick={() => setOpen(false)} aria-label="关闭配置"><X className="size-4" /></button>
            </header>
            <div className="space-y-4 p-5">
              <label className="block text-xs font-medium">代码目录<input className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs font-normal outline-none" value={cwd} placeholder="/home/knife/项目目录" disabled={saving} onChange={(event) => setCwd(event.target.value)} /></label>
              <div>
                <label className="block text-xs font-medium">模型
                  <select
                    className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-xs font-normal outline-none"
                    value={modelId}
                    disabled={saving || !modelId}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    {modelOptions.map((option) => (
                      <option key={option.id} value={option.id} disabled={!option.available}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedOption?.model ? (
                  <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                    版本：{selectedOption.model}
                    {selectedOption.detail ? ` · ${selectedOption.detail}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t px-5 py-3"><button type="button" className={buttonClass} disabled={saving} onClick={() => setOpen(false)}>取消</button><button type="button" className={cn(buttonClass, "bg-foreground text-background hover:bg-foreground/90")} disabled={saving || !modelId} onClick={() => void saveSettings()}>{saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}保存</button></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function CodexControls({ state, action, onApplied }: Props) {
  const [pending, setPending] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const requests = state?.requests || [];
  const batchable = requests.filter((request) => !request.method.includes("UserInput"));

  async function respond(request: CodexRequest, approved: boolean) {
    setPending(true);
    try {
      await action({
        action: "respond",
        id: request.id,
        approved,
        answers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, { answers: [value] }])),
      });
      if (approved && request.method === "item/tool/call" && request.preview?.affects) onApplied?.(request.preview.affects);
      setAnswers({});
    } finally {
      setPending(false);
    }
  }

  async function respondMany(items: CodexRequest[], approved: boolean) {
    setPending(true);
    try {
      for (const request of items) {
        await action({ action: "respond", id: request.id, approved });
        if (approved && request.method === "item/tool/call" && request.preview?.affects) onApplied?.(request.preview.affects);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {requests.length ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation">
          <section className="flex max-h-[min(46rem,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="codex-approval-title">
            <header className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><ShieldAlert className="size-4.5" /></div>
              <div>
                <h2 id="codex-approval-title" className="text-sm font-semibold">Codex 请求确认 {requests.length} 项操作</h2>
                <p className="mt-1 text-xs text-muted-foreground">必须允许或拒绝后才能继续。拒绝会立刻停止本轮回答。</p>
              </div>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {requests.map((request, index) => (
                <article key={request.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{requestTitle(request)}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{request.preview?.summary || String(request.params.reason || "Agent 请求执行此操作")}</p>
                    </div>
                  </div>
                  {request.preview?.diffs.length ? (
                    <ActionDiffList diffs={request.preview.diffs} />
                  ) : null}
                  {request.method.includes("UserInput") && Array.isArray(request.params.questions) ? request.params.questions.map((question: { id: string; question: string }) => <label className="mt-3 block text-xs" key={question.id}><span className="mb-1 block font-medium">{question.question}</span><input className="w-full rounded-md border bg-background px-2.5 py-2" value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} /></label>) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" className={buttonClass} disabled={pending} onClick={() => void respond(request, false)}><X className="size-3.5" />拒绝</button>
                    <button type="button" className={cn(buttonClass, "bg-foreground text-background hover:bg-foreground/90")} disabled={pending} onClick={() => void respond(request, true)}><Check className="size-3.5" />{request.method.includes("UserInput") ? "提交" : "允许"}</button>
                  </div>
                </article>
              ))}
            </div>
            {requests.length > 1 ? <footer className="flex justify-end gap-2 border-t px-5 py-3"><button type="button" className={buttonClass} disabled={pending} onClick={() => void respondMany(requests, false)}><X className="size-3.5" />全部拒绝</button><button type="button" className={cn(buttonClass, "bg-foreground text-background")} disabled={pending || !batchable.length} onClick={() => void respondMany(batchable, true)}>{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}全部允许</button></footer> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
