import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dishes } from "@/db/schema";
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
  const body = await request.json();
  const { name, categoryId, imageUrl, ingredients, steps } = body;

  const id = uuidv4();
  const now = new Date().toISOString();

  await db.insert(dishes).values({
    id,
    name,
    categoryId: categoryId || null,
    imageUrl: imageUrl || null,
    ingredients: JSON.stringify(ingredients || []),
    steps: JSON.stringify(steps || []),
    timesCooked: 0,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id });
}