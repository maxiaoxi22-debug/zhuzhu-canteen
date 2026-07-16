import { CATEGORY_META, getCategoryMeta } from "./categories";
import { HistoryEvent, HistoryStats } from "./types";

export function buildWishlistSummary(
  pendingRows: readonly unknown[],
  completionRows: readonly unknown[],
): { pending: number; completed: number } {
  return { pending: pendingRows.length, completed: completionRows.length };
}

function shiftDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildHistoryStats(events: HistoryEvent[], today: string): HistoryStats {
  const meals = events.filter((event) => event.type === "meal_planned");
  const month = today.slice(0, 7);
  const monthly = meals.filter((event) => event.date.startsWith(month));
  const mealDates = new Set(meals.map((event) => event.date));
  const counts = new Map<number, number>();
  const dishCounts = new Map<number, Map<string, number>>();

  for (const event of monthly) {
    const categoryId = getCategoryMeta(event.dish.categoryId).id;
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    const categoryDishes = dishCounts.get(categoryId) ?? new Map<string, number>();
    categoryDishes.set(event.dish.name, (categoryDishes.get(event.dish.name) ?? 0) + 1);
    dishCounts.set(categoryId, categoryDishes);
  }

  const categories = CATEGORY_META.map((meta) => {
    const favorites = [...(dishCounts.get(meta.id) ?? new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
    return {
      categoryId: meta.id,
      name: meta.name,
      icon: meta.icon,
      className: meta.className,
      achievement: meta.achievement,
      times: counts.get(meta.id) ?? 0,
      favoriteDish: favorites[0]?.[0] ?? null,
    };
  });

  const start = mealDates.has(today) ? today : shiftDate(today, -1);
  let consecutiveDays = 0;
  let cursor = start;
  while (mealDates.has(cursor)) {
    consecutiveDays += 1;
    cursor = shiftDate(cursor, -1);
  }

  const weekStart = shiftDate(today, -6);
  const weekMeals = meals.filter((event) => event.date >= weekStart && event.date <= today).length;

  return {
    monthlyMeals: monthly.length,
    consecutiveDays,
    unlockedCategories: categories.filter((category) => category.times > 0).length,
    categories,
    weekMeals,
  };
}
