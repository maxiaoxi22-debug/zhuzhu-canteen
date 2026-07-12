import { describe, expect, it } from "vitest";

describe("GET /api/image", () => {
  it("拒绝非 Vercel Blob 地址", async () => {
    const response = await fetch("http://localhost:3000/api/image?url=https%3A%2F%2Fexample.com%2Fimage.jpg");
    expect(response.status).toBe(400);
  });

  it("通过本机服务返回菜品图片并设置缓存", async () => {
    const dishes = await fetch("http://localhost:3000/api/dishes").then((response) => response.json());
    const url = encodeURIComponent(dishes[0].imageUrl);
    const response = await fetch(`http://localhost:3000/api/image?url=${url}`);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toMatch(/^image\//);
    expect(response.headers.get("cache-control")).toContain("max-age");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  }, 20_000);
});
