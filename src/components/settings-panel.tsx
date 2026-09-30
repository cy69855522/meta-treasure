"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { AppSettings, ThemeMode } from "@/lib/settings-types";
import type { FunctionToolCatalogItem } from "@/lib/agent-tools-types";
import { applyThemeToDocument } from "@/components/theme-sync";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: {
  value: ThemeMode;
  label: string;
  hint: string;
  Icon: typeof Sun;
}[] = [
  {
    value: "system",
    label: "跟随系统",
    hint: "随操作系统自动切换",
    Icon: Monitor,
  },
  {
    value: "light",
    label: "白天模式",
    hint: "浅色主题",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "夜晚模式",
    hint: "深色主题",
    Icon: Moon,
  },
];

export function SettingsPanel({
  initialSettings,
  tools,
}: {
  initialSettings: AppSettings;
  tools: FunctionToolCatalogItem[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  async function setTheme(theme: ThemeMode) {
    if (theme === settings.theme || saving) return;
    const previous = settings;
    setSettings({ ...settings, theme });
    applyThemeToDocument(theme);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      if (!res.ok) {
        throw new Error("保存失败");
      }
      const data = (await res.json()) as { settings: AppSettings };
      setSettings(data.settings);
      applyThemeToDocument(data.settings.theme);
      router.refresh();
    } catch {
      setSettings(previous);
      applyThemeToDocument(previous.theme);
      alert("保存配置失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-6">
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Settings
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">配置项</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          修改后写入本地{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            data/settings.json
          </code>
          。
        </p>
      </header>

      <section className="max-w-xl rounded-xl border bg-muted/20 p-5">
        <h2 className="text-sm font-semibold">外观</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          白天 / 夜晚 / 跟随系统，控制整站颜色主题。
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map(({ value, label, hint, Icon }) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border bg-background p-4 text-left transition",
                settings.theme === value
                  ? "border-foreground ring-2 ring-ring/40"
                  : "hover:border-foreground/30",
              )}
            >
              <Icon className="size-5" />
              <span className="font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
        {saving ? (
          <p className="mt-3 text-xs text-muted-foreground">正在同步本地文件…</p>
        ) : null}
      </section>

      <section className="rounded-xl border bg-muted/20 p-5">
        <h2 className="text-sm font-semibold">Function tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          只读。列表来自当前注册到总管家和项目顾问的工具，新增或删除工具后刷新即可看到。
        </p>
        <ul className="mt-4 space-y-3">
          {tools.map((tool) => (
            <li key={tool.name} className="rounded-lg border bg-background px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm font-medium">{tool.name}</code>
                {tool.audiences.map((audience) => (
                  <span
                    key={audience}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {audience === "steward" ? "总管家" : "项目顾问"}
                  </span>
                ))}
              </div>
              {tool.description ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{tool.description}</p>
              ) : null}
              {tool.parameters.length ? (
                <ul className="mt-2 space-y-1">
                  {tool.parameters.map((param) => (
                    <li key={param.name} className="text-xs text-muted-foreground">
                      <code className="text-foreground">{param.name}</code>
                      <span className="mx-1">{param.type}</span>
                      {param.required ? <span>必填</span> : <span>可选</span>}
                      {param.description ? <span> · {param.description}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">无参数</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
