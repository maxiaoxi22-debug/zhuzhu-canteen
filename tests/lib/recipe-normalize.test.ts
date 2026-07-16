import { describe, expect, it } from "vitest";

import { mapHowToCookCategory, normalizeRecipeName } from "../../src/lib/recipe-normalize";

describe("recipe normalization", () => {
  it("normalizes harmless whitespace and latin case only", () => {
    expect(normalizeRecipeName("  Mapo   Tofu ")).toBe("mapo tofu");
    expect(normalizeRecipeName("红烧 鲫鱼")).toBe("红烧 鲫鱼");
  });

  it("maps each supported HowToCook folder to an app category", () => {
    expect(mapHowToCookCategory("dishes/meat_dish/红烧肉.md")).toBe("肉类");
    expect(mapHowToCookCategory("dishes/aquatic/清蒸鱼.md")).toBe("海鲜");
    expect(mapHowToCookCategory("dishes/breakfast/水煮蛋.md")).toBe("主食");
    expect(mapHowToCookCategory("dishes/dessert/布丁.md")).toBe("其他");
  });

  it("rejects unknown source folders instead of guessing", () => {
    expect(() => mapHowToCookCategory("dishes/template/示例菜.md")).toThrow(/unknown HowToCook category/i);
  });
});
