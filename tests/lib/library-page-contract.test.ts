import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("饭盆页", () => {
  it("采用新版文案并保留真实筛选和右滑删除", () => {
    const source = readFileSync(new URL("../../src/components/LibraryPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("饭盆里有什么？");
    expect(source).toContain("搜索菜品或食材");
    expect(source).toContain("getCategoryMeta");
    expect(source).toContain("parseIngredients");
    expect(source).toContain("SwipeableDishRow");
    expect(source).toContain("onDeleteDish");
  });
});
