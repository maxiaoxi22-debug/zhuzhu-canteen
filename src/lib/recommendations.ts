import { getCategoryMeta } from "./categories";
import { normalizeRecipeName } from "./recipe-normalize";
import type { Dish, RecommendationItem, WishlistRecommendationInput } from "./types";

function nameCategoryKey(name: string, categoryKey: string): string {
  return `${normalizeRecipeName(name)}\u0000${categoryKey}`;
}

export function buildRecommendationPool(
  dishes: readonly Dish[],
  wishes: readonly WishlistRecommendationInput[],
  category: string,
): RecommendationItem[] {
  const items: RecommendationItem[] = [];
  const recipeIds = new Set<string>();
  const namesAndCategories = new Set<string>();

  for (const dish of dishes) {
    const categoryKey = getCategoryMeta(dish.categoryId).name;
    if (category !== "all" && categoryKey !== category) continue;
    items.push({
      source: "dish",
      dishId: dish.id,
      recipeId: dish.recipeId ?? null,
      name: dish.name,
      categoryId: dish.categoryId,
      categoryKey,
      imageUrl: dish.imageUrl,
      timesCooked: dish.timesCooked,
      sourceLabel: `饭盆 · 做过 ${dish.timesCooked} 次`,
    });
    if (dish.recipeId) recipeIds.add(dish.recipeId);
    namesAndCategories.add(nameCategoryKey(dish.name, categoryKey));
  }

  for (const wish of wishes) {
    if (wish.status !== "pending" || (category !== "all" && wish.categoryKey !== category)) continue;
    if (wish.recipeId && recipeIds.has(wish.recipeId)) continue;
    const fallbackKey = nameCategoryKey(wish.name, wish.categoryKey);
    if (namesAndCategories.has(fallbackKey)) continue;
    items.push({
      source: "wishlist",
      wishlistItemId: wish.id,
      recipeId: wish.recipeId,
      name: wish.name,
      categoryKey: wish.categoryKey,
      imageUrl: wish.imageUrl,
      sourceLabel: "心愿单 · 还没做过",
    });
    if (wish.recipeId) recipeIds.add(wish.recipeId);
    namesAndCategories.add(fallbackKey);
  }

  return items;
}
