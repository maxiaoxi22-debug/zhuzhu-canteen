import { describe, expect, it } from "vitest";
import { isManagedDishBlobUrl } from "../../src/lib/blob-delete";

describe("managed dish blob", () => {
  it("accepts only project Vercel Blob paths", () => {
    expect(isManagedDishBlobUrl("https://abc.public.blob.vercel-storage.com/zhuzhu-canteen/a.jpg")).toBe(true);
    expect(isManagedDishBlobUrl("https://example.com/zhuzhu-canteen/a.jpg")).toBe(false);
    expect(isManagedDishBlobUrl("not-a-url")).toBe(false);
  });
});
