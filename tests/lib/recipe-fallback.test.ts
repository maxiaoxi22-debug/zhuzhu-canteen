import { describe, expect, it } from "vitest";
import { generateFallbackRecipe, mergeRecipeFields } from "../../src/lib/recipe-fallback";

describe("菜名参考菜谱", () => {
  it("为红烧猪蹄生成可编辑的食材与步骤", () => {
    const recipe = generateFallbackRecipe("红烧猪蹄");
    expect(recipe.category).toBe("肉类");
    expect(recipe.ingredients.join(" ")).toContain("猪蹄");
    expect(recipe.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("为清蒸鲫鱼识别海鲜与清蒸步骤", () => {
    const recipe = generateFallbackRecipe("清蒸鲫鱼");
    expect(recipe.category).toBe("海鲜");
    expect(recipe.steps.join(" ")).toContain("蒸");
  });

  it("不覆盖用户已填写的字段", () => {
    const suggestion = generateFallbackRecipe("红烧猪蹄");
    const merged = mergeRecipeFields(
      { category: "其他", ingredients: "我的用料", steps: "" },
      suggestion,
    );
    expect(merged.category).toBe("其他");
    expect(merged.ingredients).toBe("我的用料");
    expect(merged.steps).toContain("\n");
  });
});
