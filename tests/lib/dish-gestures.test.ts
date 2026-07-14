import { describe, expect, it } from "vitest";
import { movedPastLongPressTolerance, resolveHorizontalSwipe } from "../../src/lib/dish-gestures";

describe("dish gestures", () => {
  it("cancels long press after meaningful movement", () => {
    expect(movedPastLongPressTolerance({ x: 0, y: 0 }, { x: 11, y: 0 })).toBe(true);
    expect(movedPastLongPressTolerance({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(false);
  });

  it("prioritizes vertical scrolling and opens after half the delete action width", () => {
    expect(resolveHorizontalSwipe(20, 60, 88)).toBe("vertical");
    expect(resolveHorizontalSwipe(50, 10, 88)).toBe("open");
    expect(resolveHorizontalSwipe(30, 10, 88)).toBe("closed");
  });
});
