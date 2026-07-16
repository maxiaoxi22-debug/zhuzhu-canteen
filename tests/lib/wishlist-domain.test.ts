import { describe, expect, it } from "vitest";

import { findPendingWishlistMatch } from "../../src/lib/wishlist-domain";

const items = [
  {
    id: "wish-fallback",
    recipeId: null,
    nameKey: "丸子",
    categoryKey: "肉类",
    status: "pending" as const,
  },
  {
    id: "wish-recipe-2",
    recipeId: "recipe-2",
    nameKey: "另一道菜",
    categoryKey: "肉类",
    status: "pending" as const,
  },
  {
    id: "wish-completed",
    recipeId: "recipe-completed",
    nameKey: "完成菜",
    categoryKey: "肉类",
    status: "completed" as const,
  },
];

describe("findPendingWishlistMatch", () => {
  it("prefers recipe id over normalized fallback", () => {
    expect(findPendingWishlistMatch(items, {
      recipeId: "recipe-2", name: "丸子", categoryKey: "肉类",
    })?.id).toBe("wish-recipe-2");
  });

  it("does not match the same name across different categories", () => {
    expect(findPendingWishlistMatch(items, {
      recipeId: null, name: "丸子", categoryKey: "汤类",
    })).toBeNull();
  });

  it("uses normalized name and category as a fallback", () => {
    expect(findPendingWishlistMatch(items, {
      recipeId: "missing-recipe", name: "  丸子  ", categoryKey: "肉类",
    })?.id).toBe("wish-fallback");
  });

  it("never matches a completed item", () => {
    expect(findPendingWishlistMatch(items, {
      recipeId: "recipe-completed", name: "完成菜", categoryKey: "肉类",
    })).toBeNull();
  });
});
