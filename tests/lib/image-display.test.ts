import { describe, expect, it } from "vitest";
import { getDisplayImageSrc, shouldBypassImageOptimization } from "../../src/lib/image-display";
import { readFileSync } from "node:fs";

describe("图片展示环境策略", () => {
  it("局域网开发时绕过服务端图片优化器", () => {
    expect(shouldBypassImageOptimization("development")).toBe(true);
  });

  it("正式环境保留缩略图优化", () => {
    expect(shouldBypassImageOptimization("production")).toBe(false);
  });

  it("局域网开发时让图片通过本机代理", () => {
    const source = getDisplayImageSrc("https://bucket.public.blob.vercel-storage.com/a.jpg", "development");
    expect(source).toBe("/api/image?url=https%3A%2F%2Fbucket.public.blob.vercel-storage.com%2Fa.jpg");
  });

  it("正式环境保持原始 Blob 地址", () => {
    const source = "https://bucket.public.blob.vercel-storage.com/a.jpg";
    expect(getDisplayImageSrc(source, "production")).toBe(source);
  });

  it("代理大图时不写入 Next 服务端数据缓存", () => {
    const route = readFileSync(new URL("../../src/app/api/image/route.ts", import.meta.url), "utf8");
    expect(route).toContain('cache: "no-store"');
    expect(route).not.toContain('cache: "force-cache"');
  });
});
