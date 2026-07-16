// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TodayPage from "../../src/components/TodayPage";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("TodayPage recommendation warnings", () => {
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

  it("keeps the available recommendation visible and shows a non-blocking source warning", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("/api/recommendations")) {
        return jsonResponse({
          items: [{
            source: "wishlist",
            wishlistItemId: "wish-1",
            recipeId: "recipe-1",
            name: "糖醋排骨",
            categoryKey: "肉类",
            imageUrl: null,
            sourceLabel: "心愿单 · 还没做过",
          }],
          warnings: [{ source: "dishes", message: "饭盆菜品暂时读取失败，已展示心愿单推荐" }],
        });
      }
      if (url.startsWith("/api/plans")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    }));

    await act(async () => {
      root.render(<TodayPage
        dishes={[]}
        onDishClick={vi.fn()}
        onRecipeClick={vi.fn()}
        refresh={vi.fn()}
        recommendationRevision={0}
        wishlistCount={1}
        onOpenWishlist={vi.fn()}
      />);
    });
    await flush();

    expect(container.textContent).toContain("糖醋排骨");
    expect(container.textContent).toContain("饭盆菜品暂时读取失败，已展示心愿单推荐");
  });
});
