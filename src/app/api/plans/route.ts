import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mealPlans } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const result = await db.select().from(mealPlans).where(eq(mealPlans.date, date));
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, mealType, dishId, notes } = body;

  await db.insert(mealPlans).values({
    date,
    mealType,
    dishId,
    notes: notes || null,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.delete(mealPlans).where(eq(mealPlans.id, parseInt(id)));
  return NextResponse.json({ success: true });
}