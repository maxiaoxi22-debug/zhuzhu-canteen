import { Dish, HistoryData, HistoryEvent, MealPlan } from "./types";

interface WishlistCompletionSnapshot {
  id: string;
  completedAt: string;
  nameSnapshot: string;
  imageUrlSnapshot: string | null;
}

export function mergeHistoryEvents(input: {
  dishes: Dish[];
  plans: MealPlan[];
  completions: WishlistCompletionSnapshot[];
}): HistoryEvent[] {
  const dishMap = new Map(input.dishes.map((dish) => [dish.id, dish]));
  const mealEvents: HistoryEvent[] = input.plans.flatMap((plan) => {
    const dish = plan.dishId ? dishMap.get(plan.dishId) : undefined;
    return dish ? [{
      id: `meal-${plan.id}`,
      type: "meal_planned",
      eventTime: plan.createdAt,
      date: plan.date,
      mealType: plan.mealType,
      dish,
    }] : [];
  });
  const creationEvents: HistoryEvent[] = input.dishes.map((dish) => ({
    id: `dish-${dish.id}`,
    type: "dish_created",
    eventTime: dish.createdAt,
    date: dish.createdAt.slice(0, 10),
    dish,
  }));
  const completionEvents: HistoryEvent[] = input.completions.map((completion) => ({
    id: `wishlist-${completion.id}`,
    type: "wishlist_completed",
    eventTime: completion.completedAt,
    date: completion.completedAt.slice(0, 10),
    nameSnapshot: completion.nameSnapshot,
    imageUrlSnapshot: completion.imageUrlSnapshot,
  }));

  return [...mealEvents, ...creationEvents, ...completionEvents]
    .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
}

export function buildHistoryData(
  plans: MealPlan[],
  allDishes: Dish[],
  limit: number,
  completions: WishlistCompletionSnapshot[] = [],
  wishlistSummary = { pending: 0, completed: completions.length },
): HistoryData {
  const events = mergeHistoryEvents({ plans, dishes: allDishes, completions }).slice(0, limit);

  const counts = new Map<string, number>();
  for (const plan of plans) if (plan.dishId) counts.set(plan.dishId, (counts.get(plan.dishId) || 0) + 1);
  const frequency = allDishes
    .map((dish) => ({ id: dish.id, name: dish.name, categoryId: dish.categoryId, times: counts.get(dish.id) || 0 }))
    .filter((dish) => dish.times > 0)
    .sort((a, b) => b.times - a.times)
    .slice(0, 5);

  return { events, frequency, wishlistSummary };
}
