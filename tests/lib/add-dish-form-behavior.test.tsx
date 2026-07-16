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

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn();
    onCloseSpy = vi.fn<() => void>();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(<AddDishForm dishes={[]} onClose={onCloseSpy} onSaved={vi.fn()} onOpenExisting={vi.fn()} />);
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
});
