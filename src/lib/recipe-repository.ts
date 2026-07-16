import { and, asc, eq, isNull, like, or } from "drizzle-orm";

import type { createDatabase } from "../db";
import {
  dishes,
  recipeAliases,
  recipeIngredients,
  recipes,
  recipeSteps,
  wishlistItems,
} from "../db/schema";
import { normalizeRecipeName } from "./recipe-normalize";
import { rankRecipeMatch } from "./recipe-search";
import type { RecipeDetail, RecipeSearchResult } from "./types";

export const RECIPE_SEARCH_LIMIT = 30;

export type RecipeDatabase = ReturnType<typeof createDatabase>;

const CATEGORY_ID_BY_KEY: Readonly<Record<string, number>> = {
  "肉类": 1,
  "青菜": 2,
  "主食": 3,
  "海鲜": 4,
  "汤类": 5,
  "其他": 6,
};

function ownerCondition(column: typeof dishes.ownerId | typeof wishlistItems.ownerId, ownerId: string | null) {
  return ownerId === null ? isNull(column) : eq(column, ownerId);
}

interface RecipeStatusCandidate {
  id: string;
  nameKey: string;
  categoryKey: string;
}

async function loadRecipeStatuses(
  database: RecipeDatabase,
  candidates: readonly RecipeStatusCandidate[],
  ownerId: string | null,
): Promise<Map<string, { isWishlisted: boolean; isCooked: boolean }>> {
  const [pendingItems, existingDishes] = await Promise.all([
    database
      .select({ recipeId: wishlistItems.recipeId, nameKey: wishlistItems.nameKey, categoryKey: wishlistItems.categoryKey })
      .from(wishlistItems)
      .where(and(eq(wishlistItems.status, "pending"), ownerCondition(wishlistItems.ownerId, ownerId))),
    database
      .select({ recipeId: dishes.recipeId, nameKey: dishes.nameKey, categoryId: dishes.categoryId })
      .from(dishes)
      .where(ownerCondition(dishes.ownerId, ownerId)),
  ]);

  const statusById = new Map<string, { isWishlisted: boolean; isCooked: boolean }>();
  for (const candidate of candidates) {
    const isWishlisted = pendingItems.some((item) =>
      item.recipeId === candidate.id
      || (item.recipeId === null && item.nameKey === candidate.nameKey && item.categoryKey === candidate.categoryKey));
    const categoryId = CATEGORY_ID_BY_KEY[candidate.categoryKey];
    const isCooked = existingDishes.some((dish) =>
      dish.recipeId === candidate.id
      || (dish.recipeId === null && dish.nameKey === candidate.nameKey && dish.categoryId === categoryId));
    statusById.set(candidate.id, { isWishlisted, isCooked });
  }
  return statusById;
}

export async function searchRecipes(
  database: RecipeDatabase,
  query: string,
  ownerId: string | null,
): Promise<RecipeSearchResult[]> {
  const queryKey = normalizeRecipeName(query);
  const pattern = `%${queryKey}%`;
  const rows = await database
    .select({ recipe: recipes, aliasKey: recipeAliases.aliasKey })
    .from(recipes)
    .leftJoin(recipeAliases, eq(recipeAliases.recipeId, recipes.id))
    .where(or(like(recipes.nameKey, pattern), like(recipeAliases.aliasKey, pattern)));

  const candidates = new Map<string, { recipe: typeof recipes.$inferSelect; aliasKeys: string[] }>();
  for (const row of rows) {
    const candidate = candidates.get(row.recipe.id) ?? { recipe: row.recipe, aliasKeys: [] };
    if (row.aliasKey !== null) candidate.aliasKeys.push(row.aliasKey);
    candidates.set(row.recipe.id, candidate);
  }

  const ranked = [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      rank: rankRecipeMatch(queryKey, candidate.recipe.nameKey, candidate.aliasKeys),
    }))
    .filter((candidate): candidate is typeof candidate & { rank: 0 | 1 | 2 } => candidate.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.recipe.name.localeCompare(right.recipe.name, "zh-CN"))
    .slice(0, RECIPE_SEARCH_LIMIT);
  const statuses = await loadRecipeStatuses(database, ranked.map(({ recipe }) => recipe), ownerId);

  return ranked.map(({ recipe }) => ({
    id: recipe.id,
    name: recipe.name,
    categoryKey: recipe.categoryKey,
    description: recipe.description,
    servings: recipe.servings,
    estimatedTimeMinutes: recipe.estimatedTimeMinutes,
    imageUrl: recipe.imageUrl,
    ...statuses.get(recipe.id)!,
  }));
}

export async function getRecipeDetail(database: RecipeDatabase, id: string): Promise<RecipeDetail | null> {
  const [recipe] = await database.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (!recipe) return null;

  const [ingredientRows, stepRows, aliasRows, statuses] = await Promise.all([
    database.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).orderBy(asc(recipeIngredients.sortOrder)),
    database.select().from(recipeSteps).where(eq(recipeSteps.recipeId, id)).orderBy(asc(recipeSteps.sortOrder)),
    database.select({ alias: recipeAliases.alias }).from(recipeAliases).where(eq(recipeAliases.recipeId, id)),
    loadRecipeStatuses(database, [recipe], null),
  ]);

  return {
    id: recipe.id,
    name: recipe.name,
    nameKey: recipe.nameKey,
    categoryKey: recipe.categoryKey,
    description: recipe.description,
    servings: recipe.servings,
    estimatedTimeMinutes: recipe.estimatedTimeMinutes,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    sourceLicense: recipe.sourceLicense,
    sourcePath: recipe.sourcePath,
    sourceRevision: recipe.sourceRevision,
    contentHash: recipe.contentHash,
    imageUrl: recipe.imageUrl,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    ingredients: ingredientRows.map((ingredient) => ({ ...ingredient, optional: ingredient.optional === 1 })),
    steps: stepRows,
    aliases: aliasRows.map(({ alias }) => alias).sort((left, right) => left.localeCompare(right, "zh-CN")),
    ...statuses.get(recipe.id)!,
  };
}
