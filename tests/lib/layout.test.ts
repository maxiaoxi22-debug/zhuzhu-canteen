import { describe, expect, it } from "vitest";
import { PAGE_CONTENT_CLASS } from "../../src/lib/layout";

describe("移动端页面底部空间", () => {
  it("为固定底栏和手机安全区预留空间", () => {
    expect(PAGE_CONTENT_CLASS).toContain("6rem");
    expect(PAGE_CONTENT_CLASS).toContain("safe-area-inset-bottom");
  });
});
