import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getCodexModelOptions } from "@/lib/codex-config";

describe("llmlite model options", () => {
  beforeEach(() => {
    process.env.LLMLITE_BASE_URL = "https://llm.example.test/v1";
    process.env.LLMLITE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [{ id: "proart-demo" }, { id: "  " }, { id: 3 }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
  });

  it("turns gateway models into selectable options", async () => {
    const options = await getCodexModelOptions();
    const match = options.filter((option) => option.id === "llmlite:proart-demo");
    expect(match).toHaveLength(1);
    expect(match[0]).toMatchObject({
      model: "proart-demo",
      provider: "llmlite",
      available: true,
    });
    expect(match[0]?.label).toContain("proart-demo");
    expect(options.some((option) => option.id === "llmlite:3")).toBe(false);
  });
});
