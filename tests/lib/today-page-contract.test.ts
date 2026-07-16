import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("菜单页", () => {
  it("采用猪猪推荐样式并保留真实三餐请求", () => {
    const source = readFileSync(new URL("../../src/components/TodayPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("让猪猪帮你决定");
    expect(source).toContain("猪猪随机推荐");
    expect(source).toContain('fetch("/api/plans"');
    expect(source).toContain('method: "POST"');
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("refresh()");
    expect(source).toContain("换一道，让猪猪再想想");
  });

  it("从服务端读取饭盆与心愿联合推荐并按来源打开详情和提交计划", () => {
    const source = readFileSync(new URL("../../src/components/TodayPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/recommendations?category=");
    expect(source).toContain('recommendation.source === "dish"');
    expect(source).toContain("dishId: recommendation.dishId");
    expect(source).toContain("wishlistItemId: recommendation.wishlistItemId");
    expect(source).toContain("onRecipeClick(recommendation.recipeId)");
    expect(source).toContain("心愿单 · 还没做过");
  });

  it("饭盆内容编辑后以 revision 触发推荐重新请求，而非只观察菜品数量", () => {
    const todaySource = readFileSync(new URL("../../src/components/TodayPage.tsx", import.meta.url), "utf8");
    const pageSource = readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
    expect(pageSource).toContain("recommendationRevision={refreshKey}");
    expect(todaySource).toContain("recommendationRevision: number");
    expect(todaySource).toContain("[fetchRecommendations, recommendationRevision, wishlistCount]");
    expect(todaySource).not.toContain("[fetchRecommendations, dishes.length, wishlistCount]");
  });
});
