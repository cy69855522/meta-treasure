import { describe, expect, it } from "vitest";
import { formatWaited, turnStatusLabel } from "@/lib/turn-status-label";

describe("formatWaited", () => {
  it("prints seconds, then minutes, then hours", () => {
    expect(formatWaited(0)).toBe("已等待 0 秒");
    expect(formatWaited(12)).toBe("已等待 12 秒");
    expect(formatWaited(65)).toBe("已等待 1 分 05 秒");
    expect(formatWaited(3661)).toBe("已等待 1 小时 1 分 01 秒");
  });
});

describe("turnStatusLabel", () => {
  it("appends elapsed time while the model is streaming", () => {
    expect(turnStatusLabel("streaming", 8)).toBe("模型推理中，正在流式回复… 已等待 8 秒");
  });

  it("keeps the same clock on the waiting line before the first token", () => {
    expect(turnStatusLabel("submitted", 3)).toBe("已发送，等待模型推理… 已等待 3 秒");
  });

  it("hides the line when the turn is idle", () => {
    expect(turnStatusLabel("ready", null)).toBeNull();
    expect(turnStatusLabel("error", 4)).toBeNull();
  });
});
