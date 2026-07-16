import { describe, expect, it } from "vitest";

import { mergeHistoryEvents } from "../../src/lib/history-data";
import { buildWishlistSummary } from "../../src/lib/history-stats";

describe("wishlist history", () => {
  it("builds completion events from the permanent completion snapshot", () => {
    const completion = {
      id: "completion-1",
      ownerId: null,
      wishlistItemId: "wish-1",
      recipeId: "recipe-1",
      completedDishId: "dish-1",
      addedAtSnapshot: "2026-07-01T08:00:00.000Z",
      completedAt: "2026-07-16T12:00:00.000Z",
      nameSnapshot: "糖醋排骨",
      imageUrlSnapshot: "/snapshot.jpg",
      createdAt: "2026-07-16T12:00:00.000Z",
    };

    expect(mergeHistoryEvents({
      dishes: [{
        id: "dish-1",
        name: "后来改名的排骨",
        categoryId: 1,
        imageUrl: "/current.jpg",
        ingredients: "[]",
        steps: "[]",
        timesCooked: 1,
        createdAt: "2026-07-01T12:00:00.000Z",
        updatedAt: "2026-07-01T12:00:00.000Z",
      }],
      plans: [],
      completions: [completion],
    })[0]).toMatchObject({
      type: "wishlist_completed",
      nameSnapshot: "糖醋排骨",
      imageUrlSnapshot: "/snapshot.jpg",
    });
  });

  it("summarizes pending wishes and permanent completions", () => {
    const pendingRows = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const completionRows = Array.from({ length: 6 }, (_, index) => ({ id: `${index}` }));

    expect(buildWishlistSummary(pendingRows, completionRows)).toEqual({ pending: 3, completed: 6 });
  });
});
