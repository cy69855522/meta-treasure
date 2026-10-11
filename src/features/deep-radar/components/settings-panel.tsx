"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SEARCH_SOURCE_CATALOG,
  isSourceEnabled,
  toggleSource,
  type AppSettings,
} from "@/features/deep-radar/lib/settings-types";
import type { CodexModelOption } from "@/lib/codex-types";

const GROUP_LABEL = {
  community: "社区与公众号",
  web: "网页搜索（无 key，直抓搜索页）",
} as const;

export function SettingsPanel({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState("");
  const [models, setModels] = useState<CodexModelOption[]>([]);
  const selectedModelId =
    (settings.codexModelId &&
    models.some((option) => option.id === settings.codexModelId)
      ? settings.codexModelId
      : models[0]?.id) ||
    "";

  useEffect(() => {
    setSettings(initial);
  }, [initial]);

  useEffect(() => {
    void fetch("/api/deep-radar/codex/config", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          home?: string;
          options?: CodexModelOption[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "无法读取 Codex 配置");
        setHome(data.home || "");
        setModels(data.options || []);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "无法读取 Codex 配置");
      });
  }, []);

  async function save(patch: Partial<AppSettings>) {
    const previous = settings;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/deep-radar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as {
        settings?: AppSettings;
        error?: string;
      };
      if (!res.ok || !data.settings) throw new Error(data.error || "保存失败");
      setSettings(data.settings);
      router.refresh();
    } catch (cause) {
      setSettings(previous);
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
        <div className="w-full">
          <h1 className="text-xl font-semibold">设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            研究模型、循环轮次和信息源由 Deep Radar 单独管理；主题跟随 Progress 全局设置。
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="space-y-3 rounded-2xl border p-5">
            <h2 className="text-sm font-medium">Deep Radar Codex</h2>
            <p className="break-all text-xs text-muted-foreground">
              Home：{home || "正在读取…"}
            </p>
            <label className="block space-y-2 text-sm">
              <span>模型</span>
              <select
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5"
                value={selectedModelId}
                onChange={(e) => void save({ codexModelId: e.target.value })}
                disabled={saving || !models.length}
              >
                {models.map((option) => (
                  <option key={option.id} value={option.id} disabled={!option.available}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              模型来自 Progress 的共享 Codex 配置；这里只选择 Deep Radar 研究使用的模型。
            </p>
          </section>

          <section className="space-y-4 rounded-2xl border p-5">
            <label className="block space-y-2 text-sm">
              <span>最大轮次（默认 6）</span>
              <Input
                type="number"
                min={1}
                max={15}
                value={settings.maxRounds}
                disabled={saving}
                onChange={(e) =>
                  void save({ maxRounds: Number(e.target.value) || 1 })
                }
              />
            </label>
          </section>
        </div>

        <section className="w-full space-y-3 rounded-2xl border p-5">
          <div>
            <h2 className="text-sm font-medium">信息源</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              每个来源单独开关。微信改为搜狗免费搜索；下面网页引擎也不要 API
              Key。改这里不影响已经开始或已结束的研究。
            </p>
          </div>
          {(["community", "web"] as const).map((group) => (
            <div key={group} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {GROUP_LABEL[group]}
              </p>
              <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-2">
                {SEARCH_SOURCE_CATALOG.filter((item) => item.group === group).map(
                  (meta) => {
                    const enabled = isSourceEnabled(settings.sources, meta.id);
                    return (
                      <div
                        key={meta.id}
                        className="flex items-start justify-between gap-4 rounded-xl border px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{meta.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {meta.hint}
                          </p>
                        </div>
                        <Button
                          type="button"
                          className="shrink-0"
                          variant={enabled ? "default" : "outline"}
                          disabled={saving}
                          aria-pressed={enabled}
                          onClick={() =>
                            void save({
                              sources: toggleSource(settings.sources, meta.id),
                            })
                          }
                        >
                          {enabled ? "已启用" : "未启用"}
                        </Button>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ))}
          {settings.sources.length === 0 ? (
            <p className="text-sm text-destructive">还没有启用任何信息源，循环将搜不到结果。</p>
          ) : null}
        </section>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
