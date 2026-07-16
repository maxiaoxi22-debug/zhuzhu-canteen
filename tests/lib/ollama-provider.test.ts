import { afterEach, describe, expect, it, vi } from "vitest";

import { createOllamaProvider } from "../../src/lib/vision/ollama-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ollama vision provider", () => {
  it("requires at least one candidate through Ollama structured output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: {
        content: JSON.stringify({
          candidates: [{ name: "西葫芦炒鸡蛋", category: "青菜" }],
          visibleIngredients: ["西葫芦", "鸡蛋"],
        }),
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createOllamaProvider().recognize({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
      signal: new AbortController().signal,
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.format.properties.candidates).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 3,
    });
    expect(body.format.properties.candidates.items.properties.category.enum)
      .toEqual(["肉类", "青菜", "主食", "海鲜", "汤类", "其他"]);
  });
});
