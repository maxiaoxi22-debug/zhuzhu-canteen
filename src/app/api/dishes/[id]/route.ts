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
  const now = new Date().toISOString();

  await db
    .update(dishes)
    .set({ ...body, updatedAt: now })
    .where(eq(dishes.id, id));

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(dishes).where(eq(dishes.id, id));
  return NextResponse.json({ success: true });
}