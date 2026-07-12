/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mealPlans } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const result = await db.select().from(mealPlans).where(eq(mealPlans.date, date));
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("GET /api/plans error:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, mealType, dishId, notes } = body;

    if (!date || !mealType || !dishId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await db.insert(mealPlans).values({
      date,
      mealType,
      dishId,
      notes: notes || null,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("POST /api/plans error:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(mealPlans).where(eq(mealPlans.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /api/plans error:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
