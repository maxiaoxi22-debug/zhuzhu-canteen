import { describe, expect, it } from "vitest";
import { findDishNameMatch, normalizeDishName } from "../../src/lib/dish-name-match";

const dishes = [
  { id: "1", name: "红烧肉", imageUrl: "a.jpg" },
  { id: "2", name: "Fish & Chips", imageUrl: null },
];

describe("dish name matching", () => {
  it("normalizes spaces, punctuation, width and case", () => {
    expect(normalizeDishName(" Ｆｉｓｈ & Chips！ ")).toBe("fishchips");
  });

  it("returns exact, normalized and conservative similar matches", () => {
    expect(findDishNameMatch("红烧肉", dishes)?.kind).toBe("exact");
    expect(findDishNameMatch("红 烧 肉！", dishes)?.kind).toBe("normalized");
    expect(findDishNameMatch("红烧肉儿", dishes)?.kind).toBe("similar");
  });

  it("excludes the edited dish itself", () => {
    expect(findDishNameMatch("红烧肉", dishes, "1")).toBeNull();
  });
});
