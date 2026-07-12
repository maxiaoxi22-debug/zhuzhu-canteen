import { describe, expect, it } from "vitest";
import { IMAGE_COMPRESSION_CONFIG } from "../../src/lib/image-compression";

describe("图片压缩配置", () => {
  it("限制最长边为 1600 且质量为 0.8", () => {
    expect(IMAGE_COMPRESSION_CONFIG).toEqual({ maxDimension: 1600, quality: 0.8 });
  });
});
