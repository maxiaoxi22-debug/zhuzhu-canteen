import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

import { db } from "../../../db";
import { dishes } from "../../../db/schema";
import { buildRecommendationPool } from "../../../lib/recommendations";
import { listWishlistItems, type WishlistDatabase } from "../../../lib/wishlist-repository";

export function createRecommendationHandler(database: WishlistDatabase) {
  return async function GET(request: Request): Promise<Response> {
    const category = new URL(request.url).searchParams.get("category")?.trim() || "all";
    const [dishRows, wishlist] = await Promise.all([
      database.select().from(dishes).orderBy(desc(dishes.createdAt)),
      listWishlistItems(database, null),
    ]);
    return NextResponse.json({
      items: buildRecommendationPool(dishRows, wishlist.items, category),
    });
  };
}

export const GET = createRecommendationHandler(db);
