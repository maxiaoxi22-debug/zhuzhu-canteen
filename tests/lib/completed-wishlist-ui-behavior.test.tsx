// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompletedWishlistPage from "../../src/components/CompletedWishlistPage";
import WishlistCelebration from "../../src/components/WishlistCelebration";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function button(container: HTMLElement, copy: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")]
    .find((item) => item.textContent?.includes(copy));
  if (!result) throw new Error(`button not found: ${copy}`);
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("completed wishlist UI behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders completion image snapshots and routes an existing linked dish", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [{
      id: "completion-1", recipeId: "recipe-1", completedDishId: "dish-1", dishExists: true,
      name: "木樨肉", imageUrl: "https://image.test/completed.jpg",
      addedAt: "2026-07-10T00:00:00.000Z", completedAt: "2026-07-11T00:00:00.000Z",
    }] })));
    const onOpenDish = vi.fn();
    await act(async () => root.render(
      <CompletedWishlistPage onClose={vi.fn()} onOpenRecipe={vi.fn()} onOpenDish={onOpenDish} />,
    ));
    await flush();

    const snapshot = container.querySelector('img[alt="木樨肉"]') as HTMLImageElement | null;
    expect(snapshot?.src).toBe("https://image.test/completed.jpg");
    expect(container.textContent).toContain("饭盆菜品仍在");
    await act(async () => button(container, "查看饭盆菜品").click());
    expect(onOpenDish).toHaveBeenCalledWith("dish-1");
  });

  it("marks a deleted linked dish but keeps the recipe destination", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [{
      id: "completion-2", recipeId: "recipe-2", completedDishId: null, dishExists: false,
      name: "番茄炒蛋", imageUrl: "snapshot.jpg",
      addedAt: "2026-07-10T00:00:00.000Z", completedAt: "2026-07-11T00:00:00.000Z",
    }] })));
    const onOpenRecipe = vi.fn();
    await act(async () => root.render(
      <CompletedWishlistPage onClose={vi.fn()} onOpenRecipe={onOpenRecipe} onOpenDish={vi.fn()} />,
    ));
    await flush();

    expect(container.textContent).toContain("饭盆菜品已删除");
    await act(async () => button(container, "查看菜谱").click());
    expect(onOpenRecipe).toHaveBeenCalledWith("recipe-2");
  });

  it("offers explicit destinations after a wish completes", async () => {
    const onReturnDish = vi.fn();
    const onOpenCompleted = vi.fn();
    await act(async () => root.render(
      <WishlistCelebration
        completion={{ id: "wish-1", name: "木樨肉", imageUrl: null }}
        onReturnDish={onReturnDish}
        onOpenCompleted={onOpenCompleted}
      />,
    ));

    await act(async () => button(container, "返回饭盆").click());
    await act(async () => button(container, "查看已完成心愿").click());
    expect(onReturnDish).toHaveBeenCalledOnce();
    expect(onOpenCompleted).toHaveBeenCalledOnce();
  });
});
