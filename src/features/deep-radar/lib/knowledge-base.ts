import { promises as fs } from "node:fs";
import path from "node:path";
import {
  KNOWLEDGE_DOMAINS,
  type KnowledgeFile,
  type KnowledgeFileKind,
  type KnowledgeNodeMetadata,
  type KnowledgeResource,
  type KnowledgeTree,
} from "@/features/deep-radar/lib/knowledge-types";

export const KNOWLEDGE_ROOT = path.join(process.cwd(), "knowledge_base");
const SNAKE_CASE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export function knowledgeFileKind(name: string): KnowledgeFileKind {
  const extension = path.extname(name).toLowerCase();
  if ([".md", ".markdown"].includes(extension)) return "markdown";
  if (extension === ".json") return "json";
  if ([".html", ".htm"].includes(extension)) return "html";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "other";
}

function validMetadata(value: unknown): value is KnowledgeNodeMetadata {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const source = row.source as Record<string, unknown> | undefined;
  const files = row.files as Record<string, unknown> | undefined;
  return (
    row.schema_version === 1 &&
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.summary === "string" &&
    Array.isArray(row.key_points) &&
    Array.isArray(row.topics) &&
    Array.isArray(row.keywords) &&
    typeof row.language === "string" &&
    Boolean(source) &&
    typeof source?.type === "string" &&
    typeof source?.platform === "string" &&
    typeof source?.author === "string" &&
    typeof source?.url === "string" &&
    Boolean(files) &&
    typeof files?.primary === "string" &&
    Array.isArray(files?.assets)
  );
}

async function listDirectories(directory: string) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
  } catch {
    return [];
  }
}

async function listAssets(root: string, relativeRoot: string): Promise<KnowledgeFile[]> {
  const assetRoot = path.join(root, "assets");
  const files: KnowledgeFile[] = [];
  let entries;
  try {
    entries = await fs.readdir(assetRoot, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const absolute = path.join(assetRoot, entry.name);
    const stat = await fs.stat(absolute);
    files.push({
      name: `assets/${entry.name}`,
      path: path.posix.join(relativeRoot, "assets", entry.name),
      kind: knowledgeFileKind(entry.name),
      size: stat.size,
    });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function scanResource(
  absolute: string,
  relative: string,
  name: string,
): Promise<KnowledgeResource> {
  const errors: string[] = [];
  if (!SNAKE_CASE.test(name)) errors.push("资源目录名必须使用小写 snake_case");
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const regular = entries.filter(
    (entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith("."),
  );
  const nested = entries.filter(
    (entry) => entry.isDirectory() && entry.name !== "assets" && !entry.name.startsWith("."),
  );
  if (nested.length) errors.push("资源目录下不能继续创建分类目录");

  const metadataEntries = regular.filter((entry) => entry.name === "metadata.json");
  if (metadataEntries.length !== 1) errors.push("资源必须包含一个 metadata.json");

  let metadata: KnowledgeNodeMetadata | null = null;
  if (metadataEntries.length === 1) {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(path.join(absolute, "metadata.json"), "utf8"));
      if (validMetadata(parsed)) metadata = parsed;
      else errors.push("metadata.json 字段不完整或 schema_version 不受支持");
    } catch {
      errors.push("metadata.json 不是有效 JSON");
    }
  }

  const sourceEntries = regular.filter((entry) => entry.name !== "metadata.json");
  if (sourceEntries.length !== 1) errors.push("资源目录必须包含且只能包含一个主资源文件");
  if (metadata && !sourceEntries.some((entry) => entry.name === metadata.files.primary)) {
    errors.push("metadata.files.primary 与主资源文件不一致");
  }
  if (metadata?.id !== name) errors.push("metadata.id 必须与资源目录名一致");

  const files: KnowledgeFile[] = [];
  for (const entry of regular) {
    const stat = await fs.stat(path.join(absolute, entry.name));
    files.push({
      name: entry.name,
      path: path.posix.join(relative, entry.name),
      kind: knowledgeFileKind(entry.name),
      size: stat.size,
    });
  }
  files.push(...(await listAssets(absolute, relative)));
  files.sort((a, b) => (a.name === "metadata.json" ? -1 : b.name === "metadata.json" ? 1 : a.name.localeCompare(b.name)));
  return { name, path: relative, metadata, files, errors };
}

export async function scanKnowledgeTree(root = KNOWLEDGE_ROOT): Promise<KnowledgeTree> {
  await fs.mkdir(root, { recursive: true });
  const rootEntries = await fs.readdir(root, { withFileTypes: true });
  const errors = rootEntries
    .filter((entry) => !entry.name.startsWith(".") && !KNOWLEDGE_DOMAINS.includes(entry.name as never))
    .map((entry) => `根目录包含未知领域：${entry.name}`);

  const domains = await Promise.all(
    KNOWLEDGE_DOMAINS.map(async (domainName) => {
      const domainPath = path.join(root, domainName);
      await fs.mkdir(domainPath, { recursive: true });
      const domainErrors: string[] = [];
      const topics = await Promise.all(
        (await listDirectories(domainPath)).map(async (topicEntry) => {
          const topicErrors: string[] = [];
          if (!SNAKE_CASE.test(topicEntry.name)) topicErrors.push("主题目录名必须使用小写 snake_case");
          const absoluteTopic = path.join(domainPath, topicEntry.name);
          const resourceEntries = await listDirectories(absoluteTopic);
          const looseFiles = (await fs.readdir(absoluteTopic, { withFileTypes: true })).filter(
            (entry) => entry.isFile() && !entry.name.startsWith("."),
          );
          if (looseFiles.length) topicErrors.push("主题目录下只能放资源目录，不能直接放文件");
          const resources = await Promise.all(
            resourceEntries.map((entry) =>
              scanResource(
                path.join(absoluteTopic, entry.name),
                path.posix.join(domainName, topicEntry.name, entry.name),
                entry.name,
              ),
            ),
          );
          return {
            name: topicEntry.name,
            path: path.posix.join(domainName, topicEntry.name),
            resources: resources.sort((a, b) => a.name.localeCompare(b.name)),
            errors: topicErrors,
          };
        }),
      );
      return {
        name: domainName,
        path: domainName,
        topics: topics.sort((a, b) => a.name.localeCompare(b.name)),
        errors: domainErrors,
      };
    }),
  );
  return { domains, errors };
}

export async function resolveKnowledgeFile(relativePath: string, root = KNOWLEDGE_ROOT) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new Error("INVALID_PATH");
  }
  const parts = relativePath.split(/[\\/]+/);
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) {
    throw new Error("INVALID_PATH");
  }
  if (!KNOWLEDGE_DOMAINS.includes(parts[0] as never) || parts.length < 4) {
    throw new Error("INVALID_PATH");
  }
  if (parts.length > 4 && (parts.length !== 5 || parts[3] !== "assets")) {
    throw new Error("INVALID_PATH");
  }
  const rootReal = await fs.realpath(root);
  const candidate = path.join(rootReal, ...parts);
  const candidateReal = await fs.realpath(candidate);
  if (!candidateReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("INVALID_PATH");
  const stat = await fs.lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("INVALID_PATH");
  return { absolutePath: candidateReal, stat, kind: knowledgeFileKind(parts.at(-1) ?? "") };
}
