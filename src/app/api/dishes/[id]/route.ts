import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dishes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await db.select().from(dishes).where(eq(dishes.id, id)).limit(1);
  if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result[0]);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "菜品名称不能为空" }, { status: 400 });
  }
  const existing = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.id, id)).limit(1);
  if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const now = new Date().toISOString();

  await db
    .update(dishes)
    .set({
      name: body.name.trim(),
      categoryId: typeof body.categoryId === "number" ? body.categoryId : null,
      imageUrl: typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null,
      ingredients: JSON.stringify(Array.isArray(body.ingredients) ? body.ingredients : []),
      steps: JSON.stringify(Array.isArray(body.steps) ? body.steps : []),
      updatedAt: now,
    })
    .where(eq(dishes.id, id));

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(dishes).where(eq(dishes.id, id));
  return NextResponse.json({ success: true });
}
