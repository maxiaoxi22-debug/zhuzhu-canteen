import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("猪猪心愿单界面", () => {
  it("提供菜单页入口和心愿单各级视图", () => {
    const today = source("../../src/components/TodayPage.tsx");
    const wishlist = source("../../src/components/WishlistPage.tsx");
    const detail = source("../../src/components/RecipeDetail.tsx");
    const completed = source("../../src/components/CompletedWishlistPage.tsx");

    expect(today).toContain('aria-label="打开猪猪心愿单"');
    expect(wishlist).toContain("猪猪心愿单");
    expect(wishlist).toContain("暂无匹配菜谱");
    expect(detail).toContain("采购清单");
    expect(detail).toContain("内容来源");
    expect(completed).toContain("已完成心愿");
  });
});
