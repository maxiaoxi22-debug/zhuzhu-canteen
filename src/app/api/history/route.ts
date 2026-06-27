import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mealPlans, dishes } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  const plans = await db
    .select()
    .from(mealPlans)
    .orderBy(desc(mealPlans.date), desc(mealPlans.mealType))
    .limit(limit);

  const allDishes = await db.select().from(dishes);
  const dishMap = new Map(allDishes.map((d) => [d.id, d]));

  const history = plans.map((p) => ({
    ...p,
    dish: p.dishId ? dishMap.get(p.dishId) || null : null,
  }));

  // Frequency stats
  const freq = allDishes
    .map((d) => ({ id: d.id, name: d.name, emoji: "", categoryId: d.categoryId, times: d.timesCooked }))
    .sort((a, b) => b.times - a.times)
    .slice(0, 5);

  return NextResponse.json({ history, frequency: freq });
}