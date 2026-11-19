import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildProjectAgentTools, buildStewardTools } from "@/lib/agent-tools";

/**
 * The service no longer knows tool names, so which tools run without asking
 * is decided here, on the tool definitions. This pins that decision.
 */
const READ_ONLY = [
  "getSkill",
  "getRule",
  "webSearch",
  "fetchPages",
  "fetchUrl",
  "deepRadarStart",
  "deepRadarList",
  "deepRadarFavoriteList",
  "deepRadarStatus",
  "deepRadarProgress",
  "deepRadarReport",
  "deepRadarAct",
];

describe.each([
  ["steward", () => buildStewardTools()],
  ["project agent", () => buildProjectAgentTools("catalog")],
])("%s tools", (_name, build) => {
  const tools = build();

  it("auto-approves exactly the read-only tools", () => {
    const auto = Object.entries(tools)
      .filter(([, definition]) => definition.autoApprove)
      .map(([name]) => name)
      .sort();
    expect(auto).toEqual([...READ_ONLY].sort());
  });

  it("never auto-approves anything that writes", () => {
    for (const name of ["createTask", "updateTask", "deleteTask", "createSkill", "deleteRule", "createMemoryNote"]) {
      expect(tools[name], name).toBeDefined();
      expect(tools[name].autoApprove, name).toBeUndefined();
    }
  });

  it("progress-bar tools present themselves", () => {
    for (const name of ["webSearch", "fetchPages", "fetchUrl"]) {
      expect(tools[name].begin, `${name}.begin`).toBeTypeOf("function");
      expect(tools[name].present, `${name}.present`).toBeTypeOf("function");
    }
  });
});

describe("presentations", () => {
  const ctx = { callId: "call-1" };
  const tools = buildStewardTools();
  const begin = (name: string, input: unknown) =>
    (tools[name].begin as (i: unknown, c: typeof ctx) => unknown)(input, ctx);
  const present = (name: string, input: unknown, output: unknown) =>
    (tools[name].present as (i: unknown, o: unknown, c: typeof ctx) => unknown)(input, output, ctx);

  it("webSearch shows a searching bar, then the hits under the search id", () => {
    expect(begin("webSearch", { query: "q", sources: ["baidu"] })).toMatchObject({
      search: { id: "call-1", query: "q", status: "searching" },
    });
    expect(
      present("webSearch", {}, {
        searchId: "s-1", query: "q", sources: ["baidu"],
        hits: [{ id: "baidu-1", source: "baidu", title: "T", url: "https://a.test", snippet: "" }],
      }),
    ).toMatchObject({ search: { id: "s-1", hits: [{ id: "baidu-1", title: "T" }] } });
  });

  it("fetchPages joins the search it was given", () => {
    expect(begin("fetchPages", { searchId: "s-1", items: [] })).toMatchObject({
      search: { id: "s-1", status: "fetching", phase: "fetch" },
    });
    expect(
      present("fetchPages", { searchId: "s-1" }, {
        searchId: "s-1",
        pages: [{ url: "https://a.test", title: "", text: "body", source: "baidu" }],
      }),
    ).toMatchObject({ search: { id: "s-1", pages: [{ url: "https://a.test", title: "https://a.test" }] } });
  });

  it("fetchUrl names the hosts it is visiting", () => {
    expect(begin("fetchUrl", { urls: ["https://a.test/x", "b.test"] })).toMatchObject({
      search: { id: "call-1", sources: ["a.test", "b.test"], phase: "visit" },
    });
  });

  it("deep radar shows a progress bar only when a session came back", () => {
    expect(present("deepRadarStart", {}, { sessionId: "r-1", title: "T" })).toEqual({
      radar: { sessionId: "r-1", title: "T", url: "", reportUrl: "" },
    });
    expect(present("deepRadarStart", {}, {})).toBeUndefined();
  });
});
