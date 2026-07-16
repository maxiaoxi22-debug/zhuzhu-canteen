import { NextResponse } from "next/server";

import { db } from "../../../../db";
import { searchRecipes, type RecipeDatabase } from "../../../../lib/recipe-repository";

export function createRecipeSearchHandler(database: RecipeDatabase) {
  return async function GET(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!query) return NextResponse.json({ error: "请输入菜谱名称" }, { status: 400 });
    if (query.length > 50) return NextResponse.json({ error: "搜索词不能超过 50 个字符" }, { status: 400 });

    const items = await searchRecipes(database, query, null);
    return NextResponse.json({ items, query });
  };
}

export const GET = createRecipeSearchHandler(db);
