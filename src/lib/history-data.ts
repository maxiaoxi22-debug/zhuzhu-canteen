import { Dish, HistoryData, MealPlan } from "./types";

export function buildHistoryData(plans: MealPlan[], allDishes: Dish[], limit: number): HistoryData {
  const dishMap = new Map(allDishes.map((dish) => [dish.id, dish]));
  const mealEvents = plans.flatMap((plan) => {
    const dish = plan.dishId ? dishMap.get(plan.dishId) : undefined;
    return dish ? [{
      id: `meal-${plan.id}`,
      type: "meal_planned" as const,
      eventTime: plan.createdAt,
      date: plan.date,
      mealType: plan.mealType,
      dish,
    }] : [];
  });
  const creationEvents = allDishes.map((dish) => ({
    id: `dish-${dish.id}`,
    type: "dish_created" as const,
    eventTime: dish.createdAt,
    date: dish.createdAt.slice(0, 10),
    dish,
  }));
  const events = [...mealEvents, ...creationEvents]
    .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())
    .slice(0, limit);

  const counts = new Map<string, number>();
  for (const plan of plans) if (plan.dishId) counts.set(plan.dishId, (counts.get(plan.dishId) || 0) + 1);
  const frequency = allDishes
    .map((dish) => ({ id: dish.id, name: dish.name, categoryId: dish.categoryId, times: counts.get(dish.id) || 0 }))
    .filter((dish) => dish.times > 0)
    .sort((a, b) => b.times - a.times)
    .slice(0, 5);

  return { events, frequency };
}
