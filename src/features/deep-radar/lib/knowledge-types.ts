export const KNOWLEDGE_DOMAINS = [
  "ai_infra",
  "aigc",
  "llm",
  "agent",
  "engineering",
] as const;

export type KnowledgeDomainName = (typeof KNOWLEDGE_DOMAINS)[number];
export type KnowledgeFileKind = "markdown" | "json" | "html" | "image" | "other";

export type KnowledgeNodeMetadata = {
  schema_version: 1;
  id: string;
  title: string;
  summary: string;
  key_points: string[];
  topics: string[];
  keywords: string[];
  language: string;
  source: {
    type: string;
    platform: string;
    author: string;
    url: string;
    venue?: string | null;
    published_at?: string | null;
    captured_at?: string | null;
  };
  files: {
    primary: string;
    assets: string[];
  };
};

export type KnowledgeFile = {
  name: string;
  path: string;
  kind: KnowledgeFileKind;
  size: number;
};

export type KnowledgeResource = {
  name: string;
  path: string;
  metadata: KnowledgeNodeMetadata | null;
  files: KnowledgeFile[];
  errors: string[];
};

export type KnowledgeTopic = {
  name: string;
  path: string;
  resources: KnowledgeResource[];
  errors: string[];
};

export type KnowledgeDomain = {
  name: KnowledgeDomainName;
  path: string;
  topics: KnowledgeTopic[];
  errors: string[];
};

export type KnowledgeTree = {
  domains: KnowledgeDomain[];
  errors: string[];
};
