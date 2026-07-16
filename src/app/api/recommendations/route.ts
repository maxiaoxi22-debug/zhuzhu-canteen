import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

import { db } from "../../../db";
import { dishes } from "../../../db/schema";
import { buildRecommendationPool } from "../../../lib/recommendations";
import type { Dish } from "../../../lib/types";
import { listWishlistItems, type WishlistDatabase } from "../../../lib/wishlist-repository";

interface RecommendationLoaders {
  loadDishes: (database: WishlistDatabase) => Promise<Dish[]>;
  loadWishlist: (database: WishlistDatabase) => ReturnType<typeof listWishlistItems>;
}

const defaultLoaders: RecommendationLoaders = {
  loadDishes: (database) => database.select().from(dishes).orderBy(desc(dishes.createdAt)),
  loadWishlist: (database) => listWishlistItems(database, null),
};

export function createRecommendationHandler(
  database: WishlistDatabase,
  loaders: RecommendationLoaders = defaultLoaders,
) {
  return async function GET(request: Request): Promise<Response> {
    const category = new URL(request.url).searchParams.get("category")?.trim() || "all";
    const [dishResult, wishlistResult] = await Promise.allSettled([
      loaders.loadDishes(database),
      loaders.loadWishlist(database),
    ]);

    if (dishResult.status === "rejected" && wishlistResult.status === "rejected") {
      return NextResponse.json({ error: "推荐服务暂时不可用，请稍后重试" }, { status: 503 });
    }

    const dishRows = dishResult.status === "fulfilled" ? dishResult.value : [];
    const wishlistItems = wishlistResult.status === "fulfilled" ? wishlistResult.value.items : [];
    const warnings = [];
    if (dishResult.status === "rejected") {
      warnings.push({ source: "dishes", message: "饭盆菜品暂时读取失败，已展示心愿单推荐" });
    }
    if (wishlistResult.status === "rejected") {
      warnings.push({ source: "wishlist", message: "心愿单暂时读取失败，已展示饭盆推荐" });
    }

    return NextResponse.json({
      items: buildRecommendationPool(dishRows, wishlistItems, category),
      ...(warnings.length ? { warnings } : {}),
    });
  };
}

export const GET = createRecommendationHandler(db);
