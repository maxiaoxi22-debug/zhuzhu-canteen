/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";

export async function GET() {
  try {
    const existing = await db.select().from(categories);
    if (existing.length === 0) {
      const names = ["肉类", "青菜", "主食", "海鲜", "汤类", "其他"];
      for (let i = 0; i < names.length; i++) {
        await db.insert(categories).values({ name: names[i], sortOrder: i + 1 });
      }
      return NextResponse.json({ seeded: true, count: names.length });
    }
    return NextResponse.json({ seeded: false, count: existing.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
