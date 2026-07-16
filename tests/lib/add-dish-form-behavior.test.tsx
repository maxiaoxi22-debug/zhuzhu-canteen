// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import AddDishForm from "../../src/components/AddDishForm";

vi.mock("../../src/lib/image-compression", () => ({
  compressImage: vi.fn(async (file: File) => file),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function button(container: HTMLElement, copy: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")]
    .find((item) => item.textContent?.includes(copy));
  if (!result) throw new Error(`button not found: ${copy}`);
  return result;
}

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("AddDishForm behavior", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let onCloseSpy: Mock<() => void>;
  let onSavedSpy: Mock<() => void>;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn();
    onCloseSpy = vi.fn<() => void>();
    onSavedSpy = vi.fn<() => void>();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(<AddDishForm dishes={[]} onClose={onCloseSpy} onSaved={onSavedSpy} onOpenExisting={vi.fn()} />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function upload(fileName = "dish-a.jpg", imageUrl = "https://image.test/a.jpg") {
    fetchMock.mockImplementationOnce(async () => jsonResponse({ imageUrl }));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => selectFile(fileInput, new File([fileName], fileName, { type: "image/jpeg" })));
    await flush();
  }

  it("discards a delayed wishlist match after a form field changes", async () => {
    await upload();
    const nameInput = container.querySelector('input[placeholder="例：红烧排骨"]') as HTMLInputElement;
    await act(async () => setInput(nameInput, "木樨肉"));

    const wishlist = deferred<Response>();
    fetchMock.mockImplementation((input: string) => {
      if (input.startsWith("/api/dishes/check-name")) return Promise.resolve(jsonResponse({ match: null }));
      if (input === "/api/wishlist?status=pending") return wishlist.promise;
      throw new Error(`unexpected fetch: ${input}`);
    });
    await act(async () => button(container, "保存到饭盆").click());
    await act(async () => setInput(nameInput, "清炒青菜"));
    wishlist.resolve(jsonResponse({ items: [{
      id: "wish-1", recipeId: "recipe-1", name: "木樨肉", imageUrl: null,
      categoryKey: "其他", status: "pending",
    }] }));
    await flush();

    expect(container.textContent).not.toContain("这道菜在心愿单里");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/dishes")).toHaveLength(0);
  });

  it("does not close from the backdrop while a wishlist lookup is pending", async () => {
    await upload();
    const nameInput = container.querySelector('input[placeholder="例：红烧排骨"]') as HTMLInputElement;
    await act(async () => setInput(nameInput, "木樨肉"));
    const wishlist = deferred<Response>();
    fetchMock.mockImplementation((input: string) => {
      if (input.startsWith("/api/dishes/check-name")) return Promise.resolve(jsonResponse({ match: null }));
      if (input === "/api/wishlist?status=pending") return wishlist.promise;
      throw new Error(`unexpected fetch: ${input}`);
    });
    await act(async () => button(container, "保存到饭盆").click());
    await act(async () => (container.firstElementChild as HTMLElement).click());

    expect(onCloseSpy).not.toHaveBeenCalled();
    wishlist.resolve(jsonResponse({ items: [{
      id: "wish-1", recipeId: "recipe-1", name: "木樨肉", imageUrl: null,
      categoryKey: "其他", status: "pending",
    }] }));
    await flush();
    expect(container.textContent).toContain("这道菜在心愿单里");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/dishes")).toHaveLength(0);
  });

  it("posts one immutable snapshot even when completion is clicked twice", async () => {
    await upload();
    const nameInput = container.querySelector('input[placeholder="例：红烧排骨"]') as HTMLInputElement;
    await act(async () => setInput(nameInput, "木樨肉"));
    const dishPost = deferred<Response>();
    fetchMock.mockImplementation((input: string) => {
      if (input.startsWith("/api/dishes/check-name")) return Promise.resolve(jsonResponse({ match: null }));
      if (input === "/api/wishlist?status=pending") return Promise.resolve(jsonResponse({ items: [{
        id: "wish-1", recipeId: "recipe-1", name: "木樨肉", imageUrl: null,
        categoryKey: "其他", status: "pending",
      }] }));
      if (input === "/api/dishes") return dishPost.promise;
      throw new Error(`unexpected fetch: ${input}`);
    });
    await act(async () => button(container, "保存到饭盆").click());
    await flush();
    const confirm = button(container, "完成心愿并保存");
    await act(async () => { confirm.click(); confirm.click(); });

    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/dishes")).toHaveLength(1);
    const dishCall = fetchMock.mock.calls.find(([url]) => url === "/api/dishes")!;
    expect(JSON.parse(dishCall[1].body)).toMatchObject({
      name: "木樨肉", imageUrl: "https://image.test/a.jpg",
      recipeId: "recipe-1", wishlistItemId: "wish-1", completeWishlist: true,
    });
    dishPost.resolve(jsonResponse({ id: "dish-1" }));
    await flush();
  });

  it("keeps stale upload and recognition responses out of rendered React state", async () => {
    const uploadA = deferred<Response>();
    const uploadB = deferred<Response>();
    fetchMock.mockImplementationOnce(() => uploadA.promise).mockImplementationOnce(() => uploadB.promise);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => selectFile(fileInput, new File(["a"], "a.jpg", { type: "image/jpeg" })));
    await act(async () => selectFile(fileInput, new File(["b"], "b.jpg", { type: "image/jpeg" })));
    uploadB.resolve(jsonResponse({ imageUrl: "https://image.test/b.jpg" }));
    await flush();
    uploadA.resolve(jsonResponse({ imageUrl: "https://image.test/a-late.jpg" }));
    await flush();

    const recognition = deferred<Response>();
    fetchMock.mockImplementationOnce(() => recognition.promise);
    await act(async () => button(container, "AI 智能识别").click());
    fetchMock.mockImplementationOnce(async () => jsonResponse({ imageUrl: "https://image.test/c.jpg" }));
    await act(async () => selectFile(fileInput, new File(["c"], "c.jpg", { type: "image/jpeg" })));
    await flush();
    recognition.resolve(jsonResponse({
      candidates: [{ name: "旧图菜名", category: "肉类" }],
      visibleIngredients: ["旧图食材"], provider: "gemini", requestId: "old",
    }));
    await flush();

    expect(container.textContent).not.toContain("旧图菜名");
    expect(container.textContent).not.toContain("旧图食材");

    const nameInput = container.querySelector('input[placeholder="例：红烧排骨"]') as HTMLInputElement;
    await act(async () => setInput(nameInput, "新图菜"));
    fetchMock.mockImplementation((input: string) => {
      if (input.startsWith("/api/dishes/check-name")) return Promise.resolve(jsonResponse({ match: null }));
      if (input === "/api/wishlist?status=pending") return Promise.resolve(jsonResponse({ items: [] }));
      if (input === "/api/dishes") return Promise.resolve(jsonResponse({ id: "dish-new" }));
      throw new Error(`unexpected fetch: ${input}`);
    });
    await act(async () => button(container, "保存到饭盆").click());
    await flush();
    const dishCall = fetchMock.mock.calls.find(([url]) => url === "/api/dishes")!;
    expect(JSON.parse(dishCall[1].body).imageUrl).toBe("https://image.test/c.jpg");
  });

  it("links an exact normalized AI candidate to a public recipe and saves its recipeId without a wish", async () => {
    await upload();
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === "/api/recognize") return Promise.resolve(jsonResponse({
        candidates: [{ name: "  木樨肉！", category: "肉类" }],
        visibleIngredients: [], provider: "gemini", requestId: "recognize-1",
      }));
      if (input.startsWith("/api/recipes/search")) return Promise.resolve(jsonResponse({ items: [{
        id: "recipe-1", name: "木樨肉", categoryKey: "肉类", description: null,
        servings: null, estimatedTimeMinutes: null, imageUrl: null, isWishlisted: false, isCooked: false,
      }] }));
      if (input === "/api/recipes/recipe-1") return Promise.resolve(jsonResponse({
        id: "recipe-1", name: "木樨肉", nameKey: "木樨肉", categoryKey: "肉类", description: null,
        servings: null, estimatedTimeMinutes: null, imageUrl: null, isWishlisted: false, isCooked: false,
        sourceName: "HowToCook", sourceUrl: "https://example.test", sourceLicense: "Unlicense",
        sourcePath: "dishes/meat.md", sourceRevision: "rev", contentHash: "hash",
        createdAt: "2026-07-17", updatedAt: "2026-07-17", ingredients: [], steps: [], aliases: [],
      }));
      if (input.startsWith("/api/dishes/check-name")) return Promise.resolve(jsonResponse({ match: null }));
      if (input === "/api/wishlist?status=pending") return Promise.resolve(jsonResponse({ items: [] }));
      if (input === "/api/dishes" && init?.method === "POST") return Promise.resolve(jsonResponse({ id: "dish-1" }));
      throw new Error(`unexpected fetch: ${input}`);
    });

    await act(async () => button(container, "AI 智能识别").click());
    await flush();
    await act(async () => button(container, "木樨肉").click());
    await flush();

    expect(container.textContent).toContain("已匹配公共菜谱：木樨肉");
    await act(async () => button(container, "查看公共菜谱").click());
    await flush();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/recipes/recipe-1")).toBe(true);
    await act(async () => (container.querySelector('button[aria-label="返回上一页"]') as HTMLButtonElement).click());
    expect(onCloseSpy).not.toHaveBeenCalled();

    await act(async () => button(container, "保存到饭盆").click());
    await flush();
    const dishCall = fetchMock.mock.calls.find(([url]) => url === "/api/dishes")!;
    expect(JSON.parse(dishCall[1].body)).toMatchObject({ recipeId: "recipe-1", completeWishlist: false });
  });

  it("does not let an older recipe lookup attach to a newer AI candidate", async () => {
    await upload();
    const oldLookup = deferred<Response>();
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/recognize") return Promise.resolve(jsonResponse({
        candidates: [{ name: "旧候选", category: "肉类" }, { name: "新候选", category: "青菜" }],
        visibleIngredients: [], provider: "gemini", requestId: "recognize-2",
      }));
      if (input.includes("q=%E6%97%A7%E5%80%99%E9%80%89")) return oldLookup.promise;
      if (input.includes("q=%E6%96%B0%E5%80%99%E9%80%89")) return Promise.resolve(jsonResponse({ items: [{
        id: "recipe-new", name: "新候选", categoryKey: "青菜", description: null,
        servings: null, estimatedTimeMinutes: null, imageUrl: null, isWishlisted: false, isCooked: false,
      }] }));
      if (input.startsWith("/api/dishes/check-name")) return Promise.resolve(jsonResponse({ match: null }));
      throw new Error(`unexpected fetch: ${input}`);
    });

    await act(async () => button(container, "AI 智能识别").click());
    await flush();
    await act(async () => button(container, "旧候选").click());
    await act(async () => button(container, "新候选").click());
    await flush();
    oldLookup.resolve(jsonResponse({ items: [{
      id: "recipe-old", name: "旧候选", categoryKey: "肉类", description: null,
      servings: null, estimatedTimeMinutes: null, imageUrl: null, isWishlisted: false, isCooked: false,
    }] }));
    await flush();

    expect(container.textContent).toContain("已匹配公共菜谱：新候选");
    expect(container.textContent).not.toContain("已匹配公共菜谱：旧候选");
  });

  it("cleans exact unassociated uploads on replacement and close", async () => {
    let uploadCount = 0;
    const deletedTokens: string[] = [];
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === "/api/uploads/dish-photo" && init?.method === "POST") {
        uploadCount += 1;
        return jsonResponse({ imageUrl: `https://image.test/${uploadCount}.jpg`, cleanupToken: `token-${uploadCount}` });
      }
      if (input === "/api/uploads/dish-photo" && init?.method === "DELETE") {
        deletedTokens.push(JSON.parse(String(init.body)).cleanupToken);
        return jsonResponse({ success: true });
      }
      throw new Error(`unexpected fetch: ${input}`);
    });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => selectFile(fileInput, new File(["a"], "a.jpg", { type: "image/jpeg" })));
    await flush();
    await act(async () => selectFile(fileInput, new File(["b"], "b.jpg", { type: "image/jpeg" })));
    await flush();
    await act(async () => (container.firstElementChild as HTMLElement).click());
    await flush();

    expect(deletedTokens).toEqual(["token-1", "token-2"]);
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it("cleans a stale upload that finishes after a newer photo", async () => {
    const uploadA = deferred<Response>();
    const uploadB = deferred<Response>();
    let postCount = 0;
    const deletedTokens: string[] = [];
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === "/api/uploads/dish-photo" && init?.method === "POST") {
        postCount += 1;
        return postCount === 1 ? uploadA.promise : uploadB.promise;
      }
      if (input === "/api/uploads/dish-photo" && init?.method === "DELETE") {
        deletedTokens.push(JSON.parse(String(init.body)).cleanupToken);
        return Promise.resolve(jsonResponse({ success: true }));
      }
      throw new Error(`unexpected fetch: ${input}`);
    });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => selectFile(fileInput, new File(["a"], "a.jpg", { type: "image/jpeg" })));
    await act(async () => selectFile(fileInput, new File(["b"], "b.jpg", { type: "image/jpeg" })));
    uploadB.resolve(jsonResponse({ imageUrl: "https://image.test/b.jpg", cleanupToken: "token-b" }));
    await flush();
    uploadA.resolve(jsonResponse({ imageUrl: "https://image.test/a.jpg", cleanupToken: "token-a" }));
    await flush();

    expect(deletedTokens).toEqual(["token-a"]);
    await act(async () => (container.firstElementChild as HTMLElement).click());
    await flush();
    expect(deletedTokens).toEqual(["token-a", "token-b"]);
  });

  it("keeps a failed save photo locally and cleans it on close, but never deletes a successful save", async () => {
    let saveSucceeds = false;
    const deletedTokens: string[] = [];
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === "/api/uploads/dish-photo" && init?.method === "POST") {
        return jsonResponse({ imageUrl: "https://image.test/owned.jpg", cleanupToken: "owned-token" });
      }
      if (input.startsWith("/api/dishes/check-name")) return jsonResponse({ match: null });
      if (input === "/api/wishlist?status=pending") return jsonResponse({ items: [] });
      if (input === "/api/dishes") return saveSucceeds
        ? jsonResponse({ id: "dish-saved" })
        : jsonResponse({ error: "事务失败" }, 500);
      if (input === "/api/uploads/dish-photo" && init?.method === "DELETE") {
        deletedTokens.push(JSON.parse(String(init.body)).cleanupToken);
        return jsonResponse({ success: true });
      }
      throw new Error(`unexpected fetch: ${input}`);
    });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => selectFile(fileInput, new File(["a"], "a.jpg", { type: "image/jpeg" })));
    await flush();
    const nameInput = container.querySelector('input[placeholder="例：红烧排骨"]') as HTMLInputElement;
    await act(async () => setInput(nameInput, "木樨肉"));
    await act(async () => button(container, "保存到饭盆").click());
    await flush();
    expect(container.querySelector('img[alt="预览"]')).not.toBeNull();
    expect(container.textContent).toContain("事务失败");
    await act(async () => (container.firstElementChild as HTMLElement).click());
    await flush();
    expect(deletedTokens).toEqual(["owned-token"]);

    deletedTokens.length = 0;
    saveSucceeds = true;
    await act(async () => {
      root.unmount();
      root = createRoot(container);
      root.render(<AddDishForm dishes={[]} onClose={onCloseSpy} onSaved={onSavedSpy} onOpenExisting={vi.fn()} />);
    });
    const nextInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => selectFile(nextInput, new File(["b"], "b.jpg", { type: "image/jpeg" })));
    await flush();
    const nextName = container.querySelector('input[placeholder="例：红烧排骨"]') as HTMLInputElement;
    await act(async () => setInput(nextName, "糖醋排骨"));
    await act(async () => button(container, "保存到饭盆").click());
    await flush();
    await act(async () => (container.firstElementChild as HTMLElement).click());
    await flush();
    expect(deletedTokens).toEqual([]);
  });

  it("does not race cleanup against an in-flight save during unmount", async () => {
    const dishSave = deferred<Response>();
    const deletedTokens: string[] = [];
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === "/api/uploads/dish-photo" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ imageUrl: "https://image.test/pending.jpg", cleanupToken: "pending-token" }));
      }
      if (input.startsWith("/api/dishes/check-name")) return Promise.resolve(jsonResponse({ match: null }));
      if (input === "/api/wishlist?status=pending") return Promise.resolve(jsonResponse({ items: [] }));
      if (input === "/api/dishes") return dishSave.promise;
      if (input === "/api/uploads/dish-photo" && init?.method === "DELETE") {
        deletedTokens.push(JSON.parse(String(init.body)).cleanupToken);
        return Promise.resolve(jsonResponse({ success: true }));
      }
      throw new Error(`unexpected fetch: ${input}`);
    });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => selectFile(fileInput, new File(["a"], "a.jpg", { type: "image/jpeg" })));
    await flush();
    const nameInput = container.querySelector('input[placeholder="例：红烧排骨"]') as HTMLInputElement;
    await act(async () => setInput(nameInput, "木樨肉"));
    await act(async () => button(container, "保存到饭盆").click());
    await flush();
    await act(async () => root.unmount());

    expect(deletedTokens).toEqual([]);
    dishSave.resolve(jsonResponse({ id: "dish-saved" }));
    await flush();
    expect(onSavedSpy).not.toHaveBeenCalled();
  });
});
