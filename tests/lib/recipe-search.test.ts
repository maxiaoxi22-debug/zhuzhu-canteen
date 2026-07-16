import { describe, expect, it } from "vitest";

import { rankRecipeMatch } from "../../src/lib/recipe-search";

describe("rankRecipeMatch", () => {
  it("ranks an exact recipe name first", () => {
    expect(rankRecipeMatch("鱼香肉丝", "鱼香肉丝", [])).toBe(0);
  });

  it("ranks an exact alias after an exact recipe name", () => {
    expect(rankRecipeMatch("木须肉", "木樨肉", ["木须肉"])).toBe(1);
  });

  it("ranks a partial name after exact matches", () => {
    expect(rankRecipeMatch("排骨", "糖醋排骨", [])).toBe(2);
  });

  it("does not rank an unrelated recipe", () => {
    expect(rankRecipeMatch("不存在", "糖醋排骨", [])).toBeNull();
  });

  it("accepts a partial alias match", () => {
    expect(rankRecipeMatch("木须", "木樨肉", ["家常木须肉"])).toBe(2);
  });
});
