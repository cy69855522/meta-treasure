import "server-only";

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { CodexModelOption } from "@/lib/codex-types";

type TomlSection = { path: string[]; values: Record<string, string> };
type ConfigSource = { name?: string; sections: TomlSection[] };

export function codexHome() {
  return process.env.PROGRESS_CODEX_HOME || path.join(homedir(), ".progress", "codex");
}

function splitPath(header: string) {
  const parts: string[] = [];
  let part = "";
  let quoted = false;
  for (const character of header) {
    if (character === '"') quoted = !quoted;
    else if (character === "." && !quoted) {
      parts.push(part.trim().replace(/^"|"$/g, ""));
      part = "";
    } else part += character;
  }
  if (part.trim()) parts.push(part.trim().replace(/^"|"$/g, ""));
  return parts;
}

function parseString(raw: string) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string; } catch { return value.slice(1, -1); }
  }
  return value;
}

function parseToml(text: string) {
  const sections: TomlSection[] = [{ path: [], values: {} }];
  let current = sections[0];
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      current = { path: splitPath(header[1]), values: {} };
      sections.push(current);
      continue;
    }
    const assignment = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*(?:#.*)?$/);
    if (assignment) current.values[assignment[1]] = parseString(assignment[2]);
  }
  return sections;
}

function findSection(sections: TomlSection[], pathParts: string[]) {
  return sections.find((section) => section.path.length === pathParts.length && section.path.every((part, index) => part === pathParts[index]));
}

function providerReady(provider: TomlSection | undefined, headers: TomlSection | undefined) {
  if (!provider) return true;
  const wireApi = provider.values.wire_api;
  if (wireApi && wireApi !== "responses") return false;
  const bearerToken = provider.values.experimental_bearer_token;
  if (bearerToken) return !/REPLACE_WITH|YOUR_API_KEY|CHANGE_ME/i.test(bearerToken);
  const inlineHeaders = provider.values.http_headers?.match(/(?:^|[,{])\s*["']?Authorization["']?\s*=\s*"([^"]*)"/i);
  const authorization = headers?.values.Authorization || inlineHeaders?.[1];
  if (authorization?.startsWith("Bearer ")) {
    return !/REPLACE_WITH|YOUR_API_KEY|CHANGE_ME/i.test(authorization);
  }
  const envKey = provider.values.env_key;
  if (envKey) return Boolean(process.env[envKey]);
  return provider.values.requires_openai_auth !== "false";
}

async function readConfig() {
  const home = codexHome();
  const sources: ConfigSource[] = [];
  try { sources.push({ sections: parseToml(await fs.readFile(path.join(home, "config.toml"), "utf8")) }); } catch { /* Optional. */ }
  try {
    const files = await fs.readdir(home, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".config.toml") || file.name === "config.toml") continue;
      try {
        sources.push({ name: file.name.slice(0, -".config.toml".length), sections: parseToml(await fs.readFile(path.join(home, file.name), "utf8")) });
      } catch { /* An unreadable profile is not an available model. */ }
    }
  } catch { /* The user config directory may not exist yet. */ }
  return sources;
}

function formatModelLabel(providerLabel: string, model: string, prefix?: string) {
  const base = `${providerLabel} · ${model}`;
  return prefix ? `${prefix} · ${base}` : base;
}

function profileOptions(sections: TomlSection[]): CodexModelOption[] {
  return sections
    .filter((section) => section.path[0] === "profiles" && section.path.length === 2)
    .flatMap((profile) => {
      const model = profile.values.model;
      if (!model) return [];
      const providerName = profile.values.model_provider || null;
      const provider = providerName ? findSection(sections, ["model_providers", providerName]) : undefined;
      const headers = providerName ? findSection(sections, ["model_providers", providerName, "http_headers"]) : undefined;
      if (!providerReady(provider, headers)) return [];
      const providerLabel = provider?.values.name || providerName || "Codex";
      return [{
        id: `profile:${profile.path[1]}`,
        label: formatModelLabel(providerLabel, model),
        model,
        provider: providerName,
        available: true,
        detail: `来自 Codex profile ${profile.path[1]}`,
      }];
    });
}

function configuredDefault(sections: TomlSection[]) {
  const root = findSection(sections, [])?.values;
  if (!root?.model) return [];
  const providerName = root.model_provider || null;
  const provider = providerName ? findSection(sections, ["model_providers", providerName]) : undefined;
  const headers = providerName ? findSection(sections, ["model_providers", providerName, "http_headers"]) : undefined;
  if (!providerReady(provider, headers)) return [];
  const providerLabel = provider?.values.name || providerName || "Codex";
  return [{
    id: `config:${root.model}:${providerName || ""}`,
    label: formatModelLabel(providerLabel, root.model, "配置默认"),
    model: root.model,
    provider: providerName,
    available: true,
    detail: "来自 Codex 用户配置的默认模型",
  }];
}

function profileFileOptions(sources: ConfigSource[], allSections: TomlSection[]) {
  return sources.flatMap((source) => {
    if (!source.name) return [];
    const root = findSection(source.sections, [])?.values;
    if (!root?.model) return [];
    const providerName = root.model_provider || null;
    const provider = providerName ? findSection(allSections, ["model_providers", providerName]) : undefined;
    const headers = providerName ? findSection(allSections, ["model_providers", providerName, "http_headers"]) : undefined;
    if (!providerReady(provider, headers)) return [];
    const providerLabel = provider?.values.name || providerName || "Codex";
    return [{
      id: `profile:${source.name}`,
      label: formatModelLabel(providerLabel, root.model),
      model: root.model,
      provider: providerName,
      available: true,
      detail: `来自 Codex profile 文件 ${source.name}.config.toml`,
    }];
  });
}

function extractProviderToken(
  provider: TomlSection | undefined,
  headers: TomlSection | undefined,
) {
  if (!provider) return undefined;
  if (provider.values.experimental_bearer_token) return provider.values.experimental_bearer_token;
  const inlineHeaders = provider.values.http_headers?.match(/(?:^|[,{])\s*["']?Authorization["']?\s*=\s*"([^"]*)"/i);
  const authorization = headers?.values.Authorization || inlineHeaders?.[1];
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  const envKey = provider.values.env_key;
  if (envKey) return process.env[envKey];
  return undefined;
}

const LLMLITE_CACHE_MS = 30_000;
let llmliteCache: { at: number; key: string; options: CodexModelOption[] } | null = null;

/** Models advertised by the LLMLite gateway. A short cache keeps each chat turn from waiting on `/models`. */
async function llmliteDynamicOptions(allSections: TomlSection[]): Promise<CodexModelOption[]> {
  const provider = findSection(allSections, ["model_providers", "llmlite"]);
  const headers = findSection(allSections, ["model_providers", "llmlite", "http_headers"]);
  if (provider && !providerReady(provider, headers)) return [];

  const baseUrl = (provider?.values.base_url || process.env.LLMLITE_BASE_URL || "").replace(/\/+$/, "");
  const token = extractProviderToken(provider, headers) || process.env.LLMLITE_API_KEY || "";
  if (!baseUrl || (!provider && !process.env.LLMLITE_BASE_URL && !process.env.LLMLITE_API_KEY)) return [];

  const cacheKey = `${baseUrl}\n${token}`;
  if (llmliteCache && llmliteCache.key === cacheKey && Date.now() - llmliteCache.at < LLMLITE_CACHE_MS) {
    return llmliteCache.options;
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`LLMLite /models HTTP ${response.status}`);
    const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const providerLabel = provider?.values.name || "LLMLite";
    const options: CodexModelOption[] = [];
    for (const item of payload.data || []) {
      const model = typeof item?.id === "string" ? item.id.trim() : "";
      if (!model) continue;
      options.push({
        id: `llmlite:${model}`,
        label: formatModelLabel(providerLabel, model),
        model,
        provider: "llmlite",
        available: true,
        detail: `来自 LLMLite 网关 (${baseUrl})`,
      });
    }
    llmliteCache = { at: Date.now(), key: cacheKey, options };
    return options;
  } catch {
    if (llmliteCache?.key === cacheKey) return llmliteCache.options;
    return [];
  }
}

export async function getCodexModelOptions(): Promise<CodexModelOption[]> {
  const sources = await readConfig();
  const mainSections = sources.find((source) => !source.name)?.sections || [];
  const allSections = sources.flatMap((source) => source.sections);
  // Custom providers/profiles + LLMLite only — never stock Codex GPT catalog.
  const all = [
    ...configuredDefault(mainSections),
    ...profileOptions(mainSections),
    ...profileFileOptions(sources, allSections),
    ...(await llmliteDynamicOptions(allSections)),
  ];
  const seen = new Set<string>();
  return all.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

export async function resolveCodexModel(modelId: unknown) {
  const options = await getCodexModelOptions();
  const requested = typeof modelId === "string" && modelId ? options.find((option) => option.id === modelId) : options[0];
  if (!requested) throw new Error("当前 Codex 配置没有可用的文本模型");
  return requested;
}
