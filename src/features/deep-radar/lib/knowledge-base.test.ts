import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveKnowledgeFile, scanKnowledgeTree } from "@/features/deep-radar/lib/knowledge-base";
import { KNOWLEDGE_DOMAINS } from "@/features/deep-radar/lib/knowledge-types";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "deep-radar-kb-"));
  roots.push(root);
  return root;
}

function metadata(id: string, primary = "source.md") {
  return {
    schema_version: 1,
    id,
    title: "Flash Attention",
    summary: "摘要",
    key_points: ["关键点"],
    topics: ["flash_attention"],
    keywords: ["IO aware"],
    language: "zh-CN",
    source: {
      type: "webpage",
      platform: "example",
      author: "author",
      url: "https://example.com",
    },
    files: { primary, assets: [] },
  };
}

async function createResource(root: string, id = "flash_attention_paper") {
  const directory = path.join(root, "ai_infra", "flash_attention", id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "metadata.json"), JSON.stringify(metadata(id)));
  await writeFile(path.join(directory, "source.md"), "# Flash Attention");
  return directory;
}

describe("knowledge base scanner", () => {
  it("always returns the five fixed domains and reads a valid four-level resource", async () => {
    const root = await tempRoot();
    await createResource(root);
    const tree = await scanKnowledgeTree(root);
    expect(tree.domains.map((domain) => domain.name)).toEqual(KNOWLEDGE_DOMAINS);
    const resource = tree.domains[0].topics[0].resources[0];
    expect(resource.metadata?.title).toBe("Flash Attention");
    expect(resource.files.map((file) => file.name)).toEqual(["metadata.json", "source.md"]);
    expect(resource.errors).toEqual([]);
  });

  it("marks malformed metadata, extra primary files, and illegal nested categories", async () => {
    const root = await tempRoot();
    const directory = await createResource(root);
    await writeFile(path.join(directory, "extra.html"), "<p>extra</p>");
    await writeFile(path.join(directory, "metadata.json"), "{");
    await mkdir(path.join(directory, "fifth_level"));
    const resource = (await scanKnowledgeTree(root)).domains[0].topics[0].resources[0];
    expect(resource.errors).toContain("metadata.json 不是有效 JSON");
    expect(resource.errors).toContain("资源目录必须包含且只能包含一个主资源文件");
    expect(resource.errors).toContain("资源目录下不能继续创建分类目录");
  });

  it("reports unknown root domains without hiding valid domains", async () => {
    const root = await tempRoot();
    await mkdir(path.join(root, "unknown"));
    const tree = await scanKnowledgeTree(root);
    expect(tree.errors).toEqual(["根目录包含未知领域：unknown"]);
    expect(tree.domains).toHaveLength(5);
  });
});

describe("knowledge content path safety", () => {
  it("resolves files inside a valid resource", async () => {
    const root = await tempRoot();
    await createResource(root);
    const result = await resolveKnowledgeFile(
      "ai_infra/flash_attention/flash_attention_paper/source.md",
      root,
    );
    expect(result.kind).toBe("markdown");
  });

  it("rejects traversal, unknown domains, and symlinks", async () => {
    const root = await tempRoot();
    const directory = await createResource(root);
    await symlink(path.join(directory, "source.md"), path.join(directory, "linked.md"));
    await expect(resolveKnowledgeFile("../outside.md", root)).rejects.toThrow("INVALID_PATH");
    await expect(
      resolveKnowledgeFile("unknown/topic/resource/source.md", root),
    ).rejects.toThrow("INVALID_PATH");
    await expect(
      resolveKnowledgeFile("ai_infra/flash_attention/flash_attention_paper/linked.md", root),
    ).rejects.toThrow("INVALID_PATH");
  });
});
