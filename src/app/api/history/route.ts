import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mealPlans, dishes } from "@/db/schema";
import { desc } from "drizzle-orm";
import { buildHistoryData } from "@/lib/history-data";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  const [plans, allDishes] = await Promise.all([
    db.select().from(mealPlans).orderBy(desc(mealPlans.date), desc(mealPlans.mealType)).limit(limit),
    db.select().from(dishes),
  ]);

  return NextResponse.json(buildHistoryData(plans, allDishes, limit));
}
