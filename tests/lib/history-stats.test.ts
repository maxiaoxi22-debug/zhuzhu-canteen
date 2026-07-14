import { describe, expect, it } from "vitest";
import { buildHistoryStats } from "../../src/lib/history-stats";
import { Dish, HistoryEvent } from "../../src/lib/types";

const dish = (id: string, name: string, categoryId: number): Dish => ({
  id, name, categoryId, imageUrl: null, ingredients: "[]", steps: "[]",
  timesCooked: 0, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
});

const meal = (id: string, date: string, item: Dish): HistoryEvent => ({
  id, type: "meal_planned", eventTime: `${date}T12:00:00.000Z`, date, mealType: "lunch", dish: item,
});

describe("history stats", () => {
  it("counts only real meal events for monthly and category achievements", () => {
    const meat = dish("meat", "红烧肉", 1);
    const veg = dish("veg", "空心菜", 2);
    const events: HistoryEvent[] = [
      meal("m1", "2026-07-14", meat),
      meal("m2", "2026-07-13", veg),
      { id: "created", type: "dish_created", eventTime: "2026-07-14T08:00:00.000Z", date: "2026-07-14", dish: meat },
      meal("old", "2026-06-30", meat),
    ];
    const stats = buildHistoryStats(events, "2026-07-14");
    expect(stats.monthlyMeals).toBe(2);
    expect(stats.unlockedCategories).toBe(2);
    expect(stats.categories.find((item) => item.categoryId === 1)).toMatchObject({ times: 1, favoriteDish: "红烧肉" });
  });

  it("calculates a consecutive run ending today or yesterday", () => {
    const item = dish("dish", "家常菜", 6);
    const events = [meal("1", "2026-07-14", item), meal("2", "2026-07-13", item), meal("3", "2026-07-12", item)];
    expect(buildHistoryStats(events, "2026-07-14").consecutiveDays).toBe(3);
    expect(buildHistoryStats(events.slice(1), "2026-07-14").consecutiveDays).toBe(2);
  });

  it("counts meals in the latest seven calendar days", () => {
    const item = dish("dish", "家常菜", 6);
    const events = [meal("1", "2026-07-14", item), meal("2", "2026-07-08", item), meal("3", "2026-07-07", item)];
    expect(buildHistoryStats(events, "2026-07-14").weekMeals).toBe(2);
  });
});
