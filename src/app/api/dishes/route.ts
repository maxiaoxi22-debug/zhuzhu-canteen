/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dishes, mealPlans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const cat = searchParams.get("cat") || "";

  let query = db.select().from(dishes).orderBy(desc(dishes.createdAt));
  if (cat) query = query.where(eq(dishes.categoryId, parseInt(cat))) as typeof query;
  const result = await query;
  let data = result;
  if (q) {
    data = data.filter((d) => d.name.includes(q));
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, categoryId, imageUrl, ingredients, steps } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "菜品名称不能为空" }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.insert(dishes).values({
      id,
      name: name.trim(),
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
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Delete related meal plans first
    await db.delete(mealPlans).where(eq(mealPlans.dishId, id));
    await db.delete(dishes).where(eq(dishes.id, id));

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/dishes error:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
