import { NextRequest, NextResponse } from "next/server";
import { findDishDuplicate } from "@/lib/dish-duplicate-server";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() || "";
  const excludeId = request.nextUrl.searchParams.get("excludeId") || undefined;
  if (!name) return NextResponse.json({ error: "菜品名称不能为空" }, { status: 400 });
  return NextResponse.json({ match: await findDishDuplicate(name, excludeId) });
}
