/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dishes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { findDishDuplicate } from "@/lib/dish-duplicate-server";
import { normalizeDishName } from "@/lib/dish-name-match";
import { withRetry } from "@/lib/network-resilience";

let lastSuccessfulDishes: (typeof dishes.$inferSelect)[] = [];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const cat = searchParams.get("cat") || "";
    const result = await withRetry(async () => {
      let query = db.select().from(dishes).orderBy(desc(dishes.createdAt));
      if (cat) query = query.where(eq(dishes.categoryId, parseInt(cat))) as typeof query;
      return await query;
    }, 2);
    lastSuccessfulDishes = result;
    const data = q ? result.filter((dish) => dish.name.includes(q)) : result;
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/dishes error:", error);
    if (lastSuccessfulDishes.length) {
      return NextResponse.json(lastSuccessfulDishes, { headers: { "X-Zhuzhu-Stale": "1" } });
    }
    return NextResponse.json({ error: "菜单服务暂时连接不上，请稍后重试" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, categoryId, imageUrl, ingredients, steps } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "菜品名称不能为空" }, { status: 400 });
    }

    const match = await findDishDuplicate(name.trim());
    if (match) return NextResponse.json({ error: match.message, match }, { status: 409 });

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.insert(dishes).values({
      id,
      name: name.trim(),
      nameKey: normalizeDishName(name),
      categoryId: categoryId || null,
      imageUrl: imageUrl || null,
      ingredients: JSON.stringify(ingredients || []),
      steps: JSON.stringify(steps || []),
      timesCooked: 0,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ id });
  } catch (error: any) {
    console.error("POST /api/dishes error:", error);
    if (String(error?.message || error).toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "菜单库已有这道菜" }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
