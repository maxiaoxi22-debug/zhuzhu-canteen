import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { buildRecommendationPool } from "../../src/lib/recommendations";
import { createRecommendationHandler } from "../../src/app/api/recommendations/route";
import type { Dish, WishlistRecommendationInput } from "../../src/lib/types";

const now = "2026-07-17T00:00:00.000Z";

function dish(overrides: Partial<Dish> = {}): Dish {
  return {
    id: "dish-1",
    name: "木樨肉",
    categoryId: 1,
    imageUrl: "dish.jpg",
    ingredients: "[]",
    steps: "[]",
    recipeId: "recipe-1",
    wishlistItemId: null,
    timesCooked: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function wish(overrides: Partial<WishlistRecommendationInput> = {}): WishlistRecommendationInput {
  return {
    id: "wish-1",
    recipeId: "recipe-1",
    name: "木樨肉",
    categoryKey: "肉类",
    imageUrl: "recipe.jpg",
    status: "pending",
    ...overrides,
  };
}

describe("buildRecommendationPool", () => {
  it("loads dishes newest first before retaining the first duplicate", () => {
    const route = readFileSync(new URL("../../src/app/api/recommendations/route.ts", import.meta.url), "utf8");
    expect(route).toContain("orderBy(desc(dishes.createdAt))");
  });

  it("keeps the dish when a pending wish points to the same recipe", () => {
    const pool = buildRecommendationPool([dish()], [wish()], "all");

    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ source: "dish", dishId: "dish-1", recipeId: "recipe-1" });
  });

  it("keeps the first dish when two dishes point to the same recipe", () => {
    const pool = buildRecommendationPool([
      dish({ id: "newest", name: "新名称", createdAt: "2026-07-17T02:00:00.000Z" }),
      dish({ id: "older", name: "旧名称", createdAt: "2026-07-16T02:00:00.000Z" }),
    ], [], "all");

    expect(pool).toMatchObject([{ source: "dish", dishId: "newest" }]);
  });

  it("keeps the first dish when normalized name and category match", () => {
    const pool = buildRecommendationPool([
      dish({ id: "newest", recipeId: null, name: "  番茄炒蛋 ", categoryId: 1 }),
      dish({ id: "older", recipeId: null, name: "番茄炒蛋", categoryId: 1 }),
    ], [], "all");

    expect(pool).toMatchObject([{ source: "dish", dishId: "newest" }]);
  });

  it("falls back to normalized name and category deduplication", () => {
    const pool = buildRecommendationPool(
      [dish({ recipeId: null, name: "  番茄炒蛋 ", categoryId: 1 })],
      [wish({ recipeId: null, name: "番茄炒蛋", categoryKey: "肉类" })],
      "all",
    );

    expect(pool).toHaveLength(1);
    expect(pool[0].source).toBe("dish");
  });

  it("includes pending wishes in category filters with an explicit source label", () => {
    const pool = buildRecommendationPool([], [wish({ categoryKey: "青菜" })], "青菜");

    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({
      source: "wishlist",
      wishlistItemId: "wish-1",
      categoryKey: "青菜",
      sourceLabel: "心愿单 · 还没做过",
    });
  });

  it("excludes completed wishes and items outside the selected category", () => {
    expect(buildRecommendationPool(
      [dish({ categoryId: 1 })],
      [wish({ id: "completed", status: "completed" }), wish({ id: "vegetable", categoryKey: "青菜" })],
      "青菜",
    )).toMatchObject([{ source: "wishlist", wishlistItemId: "vegetable" }]);
  });
});

describe("GET /api/recommendations partial degradation", () => {
  const request = new Request("http://localhost/api/recommendations?category=all");
  const database = {} as Parameters<typeof createRecommendationHandler>[0];

  it("returns wishlist recommendations and a non-blocking warning when dishes fail", async () => {
    const GET = createRecommendationHandler(database, {
      loadDishes: vi.fn().mockRejectedValue(new Error("dishes unavailable")),
      loadWishlist: vi.fn().mockResolvedValue({
        items: [wish({ recipeId: "recipe-wish", name: "糖醋排骨" })],
        pendingCount: 1,
        completedCount: 0,
      }),
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [expect.objectContaining({ source: "wishlist", name: "糖醋排骨" })],
      warnings: [{ source: "dishes", message: "饭盆菜品暂时读取失败，已展示心愿单推荐" }],
    });
  });

  it("returns dish recommendations and a non-blocking warning when wishlist fails", async () => {
    const GET = createRecommendationHandler(database, {
      loadDishes: vi.fn().mockResolvedValue([dish({ recipeId: "recipe-dish", name: "木樨肉" })]),
      loadWishlist: vi.fn().mockRejectedValue(new Error("wishlist unavailable")),
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [expect.objectContaining({ source: "dish", name: "木樨肉" })],
      warnings: [{ source: "wishlist", message: "心愿单暂时读取失败，已展示饭盆推荐" }],
    });
  });

  it("returns a service error when both recommendation sources fail", async () => {
    const GET = createRecommendationHandler(database, {
      loadDishes: vi.fn().mockRejectedValue(new Error("dishes unavailable")),
      loadWishlist: vi.fn().mockRejectedValue(new Error("wishlist unavailable")),
    });

    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "推荐服务暂时不可用，请稍后重试" });
  });
});
