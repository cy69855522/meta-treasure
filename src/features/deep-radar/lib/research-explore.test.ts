import { describe, expect, it } from "vitest";
import { parseGithubUrl, markdownChildLinks } from "@progress/deep-research";
import {
  allowedExploreUrls,
  parseExploreDecision,
} from "@/features/deep-radar/lib/research-explore";
import type { DraftRound } from "@/features/deep-radar/lib/research-types";

describe("github urls", () => {
  it("parses repo, blob, and raw addresses", () => {
    expect(
      parseGithubUrl("https://github.com/Young-Lord/cs336-2026-notes"),
    ).toMatchObject({
      owner: "Young-Lord",
      repo: "cs336-2026-notes",
      kind: "repo",
    });
    expect(
      parseGithubUrl(
        "https://github.com/Young-Lord/cs336-2026-notes/blob/main/docs/lectures/01/04-syllabus.md",
      ),
    ).toMatchObject({
      kind: "blob",
      ref: "main",
      path: "docs/lectures/01/04-syllabus.md",
    });
    expect(
      parseGithubUrl(
        "https://raw.githubusercontent.com/Young-Lord/cs336-2026-notes/main/docs/lectures/01/04-syllabus.md",
      ),
    ).toMatchObject({
      kind: "raw",
      path: "docs/lectures/01/04-syllabus.md",
    });
  });

  it("extracts relative markdown links against a blob url", () => {
    const links = markdownChildLinks(
      "See [next](./05-math.md) and [home](/Young-Lord/cs336-2026-notes)",
      "https://github.com/Young-Lord/cs336-2026-notes/blob/main/docs/lectures/01/04-syllabus.md",
    );
    expect(links.map((link) => link.url)).toContain(
      "https://github.com/Young-Lord/cs336-2026-notes/blob/main/docs/lectures/01/05-math.md",
    );
  });
});

describe("fetch_page explore decisions", () => {
  it("parses fetch_page and done payloads", () => {
    expect(
      parseExploreDecision(
        JSON.stringify({
          tool: "fetch_page",
          urls: [
            "https://github.com/Young-Lord/cs336-2026-notes/blob/main/README.md",
          ],
          reason: "读仓库说明",
        }),
      ).urls,
    ).toHaveLength(1);
    expect(parseExploreDecision('{"tool":"done"}')).toEqual({
      urls: [],
      reason: undefined,
    });
  });

  it("caps one fetch_page at 32 urls", () => {
    const urls = Array.from(
      { length: 40 },
      (_, i) => `https://github.com/Young-Lord/cs336-2026-notes/blob/main/l${i}.md`,
    );
    expect(
      parseExploreDecision(JSON.stringify({ tool: "fetch_page", urls })).urls,
    ).toHaveLength(32);
  });

  it("only follows child links or the same GitHub repo", () => {
    const draft: DraftRound = {
      query: "cs336",
      step: "exploring",
      hits: [
        {
          url: "https://github.com/Young-Lord/cs336-2026-notes",
          normalizedUrl: "https://github.com/Young-Lord/cs336-2026-notes",
          title: "cs336 notes",
          source: "google",
          cited: true,
          roundIndex: 0,
          extracted: "子页面列表",
          childLinks: [
            {
              url: "https://github.com/Young-Lord/cs336-2026-notes/blob/main/README.md",
              title: "README",
            },
          ],
        },
      ],
    };
    expect(
      allowedExploreUrls(draft, [
        "https://github.com/Young-Lord/cs336-2026-notes/blob/main/docs/lectures/01/04-syllabus.md",
        "https://evil.example/steal",
      ]),
    ).toEqual([
      "https://github.com/Young-Lord/cs336-2026-notes/blob/main/docs/lectures/01/04-syllabus.md",
    ]);
  });
});
