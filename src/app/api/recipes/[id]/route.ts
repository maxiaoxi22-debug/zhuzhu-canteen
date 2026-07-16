import { NextResponse } from "next/server";

import { db } from "../../../../db";
import { getRecipeDetail, type RecipeDatabase } from "../../../../lib/recipe-repository";

interface RecipeRouteContext {
  params: Promise<{ id: string }>;
}

export function createRecipeDetailHandler(database: RecipeDatabase) {
  return async function GET(_request: Request, context: RecipeRouteContext): Promise<Response> {
    const { id } = await context.params;
    const recipe = await getRecipeDetail(database, id);
    if (!recipe) return NextResponse.json({ error: "菜谱不存在" }, { status: 404 });
    return NextResponse.json(recipe);
  };
}

export const GET = createRecipeDetailHandler(db);
