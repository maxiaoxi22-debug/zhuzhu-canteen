import { describe, expect, it } from "vitest";
import { buildHistoryData } from "../../src/lib/history-data";

const dish = (id: string, name: string, createdAt: string) => ({
  id, name, categoryId: 1, imageUrl: null, ingredients: "[]", steps: "[]",
  timesCooked: 0, createdAt, updatedAt: createdAt, nameKey: null,
});

describe("history data", () => {
  it("merges creation and meal events and builds frequency", () => {
    const dishes = [dish("a", "红烧肉", "2026-07-01T10:00:00.000Z")];
    const plans = [{ id: 1, date: "2026-07-02", mealType: "dinner", dishId: "a", notes: null, createdAt: "2026-07-02T10:00:00.000Z" }];
    const result = buildHistoryData(plans, dishes, 50);
    expect(result.events.map((event) => event.type)).toEqual(["meal_planned", "dish_created"]);
    expect(result.frequency).toEqual([{ id: "a", name: "红烧肉", categoryId: 1, times: 1 }]);
  });
});
