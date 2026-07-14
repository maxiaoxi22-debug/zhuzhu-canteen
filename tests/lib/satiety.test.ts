import { describe, expect, it } from "vitest";
import { increaseSatiety, readDailySatiety } from "../../src/lib/satiety";

describe("daily satiety", () => {
  it("reads today's valid persisted value", () => {
    const storage = { getItem: () => JSON.stringify({ date: "2026-07-14", value: 40 }) };
    expect(readDailySatiety(storage, "2026-07-14")).toEqual({ date: "2026-07-14", value: 40 });
  });

  it("resets stale or invalid data", () => {
    const stale = { getItem: () => JSON.stringify({ date: "2026-07-13", value: 80 }) };
    const invalid = { getItem: () => "not-json" };
    expect(readDailySatiety(stale, "2026-07-14")).toEqual({ date: "2026-07-14", value: 0 });
    expect(readDailySatiety(invalid, "2026-07-14")).toEqual({ date: "2026-07-14", value: 0 });
  });

  it("adds twenty and caps at one hundred", () => {
    expect(increaseSatiety({ date: "2026-07-14", value: 40 }, "2026-07-14").value).toBe(60);
    expect(increaseSatiety({ date: "2026-07-14", value: 90 }, "2026-07-14").value).toBe(100);
  });
});
