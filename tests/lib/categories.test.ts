import { describe, expect, it } from "vitest";
import { getCategoryMeta } from "../../src/lib/categories";

describe("category metadata", () => {
  it("maps database category ids to the shared display model", () => {
    expect(getCategoryMeta(1)).toMatchObject({ name: "肉类", icon: "🥩", achievement: "肉肉达人" });
    expect(getCategoryMeta(6)).toMatchObject({ name: "其他", icon: "🍳", achievement: "惊喜探索家" });
  });

  it("uses the safe fallback for null and unknown ids", () => {
    expect(getCategoryMeta(null).name).toBe("其他");
    expect(getCategoryMeta(99).icon).toBe("🍳");
  });
});
