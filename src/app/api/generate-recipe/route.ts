import { NextRequest, NextResponse } from "next/server";
import { generateRecipeFromName } from "@/lib/gemini";
import { generateFallbackRecipe } from "@/lib/recipe-fallback";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "请先填写菜名" }, { status: 400 });

  try {
    const recipe = await generateRecipeFromName(name);
    if (!Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) throw new Error("Invalid recipe response");
    return NextResponse.json({ ...recipe, name, source: "gemini" });
  } catch (error) {
    console.warn("Gemini recipe generation unavailable, using template:", error instanceof Error ? error.message : error);
    return NextResponse.json(generateFallbackRecipe(name));
  }
}
