import { describe, expect, it } from "vitest";
import {
  SEARCH_SOURCE_CATALOG,
  normalizeSources,
  toggleSource,
} from "@/features/deep-radar/lib/settings-types";

describe("source toggles", () => {
  it("migrates the old combined source mode", () => {
    expect(normalizeSources("both")).toEqual(["zhihu", "wechat"]);
    expect(normalizeSources("zhihu")).toEqual(["zhihu"]);
    expect(normalizeSources("wechat")).toEqual(["wechat"]);
  });

  it("keeps independent lists and empty selection", () => {
    expect(normalizeSources(["wechat", "zhihu", "zhihu"])).toEqual([
      "wechat",
      "zhihu",
    ]);
    expect(normalizeSources(["baidu", "wechat"])).toEqual(["baidu", "wechat"]);
    expect(normalizeSources(["unknown", "sogou"])).toEqual(["sogou"]);
    expect(normalizeSources([])).toEqual([]);
  });

  it("toggles one source without a combined both option", () => {
    expect(toggleSource(["zhihu", "wechat"], "wechat")).toEqual(["zhihu"]);
    expect(toggleSource(["zhihu"], "wechat")).toEqual(["zhihu", "wechat"]);
    expect(toggleSource(["zhihu", "wechat"], "baidu")).toEqual([
      "zhihu",
      "wechat",
      "baidu",
    ]);
    expect(toggleSource(["zhihu"], "zhihu")).toEqual([]);
  });

  it("gives each source a unique one-line intro", () => {
    const hints = SEARCH_SOURCE_CATALOG.map((item) => item.hint.trim());
    expect(hints.every((hint) => hint.length >= 12)).toBe(true);
    expect(new Set(hints).size).toBe(hints.length);
  });
});
