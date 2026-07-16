import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db, type createDatabase } from "../../../db";
import { dishes, mealPlans, wishlistCompletions, wishlistItems } from "../../../db/schema";
import { buildHistoryData } from "../../../lib/history-data";
import { buildWishlistSummary } from "../../../lib/history-stats";

type HistoryDatabase = ReturnType<typeof createDatabase>;

export function createHistoryHandler(database: HistoryDatabase) {
  return async function GET(request: Request): Promise<Response> {
    const requestedLimit = Number.parseInt(new URL(request.url).searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 50;

    const [plans, allDishes, pendingRows, completions] = await Promise.all([
      database.select().from(mealPlans).orderBy(desc(mealPlans.date), desc(mealPlans.mealType)).limit(limit),
      database.select().from(dishes),
      database.select({ id: wishlistItems.id }).from(wishlistItems).where(eq(wishlistItems.status, "pending")),
      database.select().from(wishlistCompletions).orderBy(desc(wishlistCompletions.completedAt)),
    ]);

    return NextResponse.json(buildHistoryData(
      plans,
      allDishes,
      limit,
      completions,
      buildWishlistSummary(pendingRows, completions),
    ));
  };
}

export const GET = createHistoryHandler(db);
