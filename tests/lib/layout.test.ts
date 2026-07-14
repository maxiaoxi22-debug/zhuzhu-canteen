import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PAGE_CONTENT_CLASS } from "../../src/lib/layout";

describe("移动端页面底部空间", () => {
  it("为固定底栏和手机安全区预留空间", () => {
    const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
    expect(PAGE_CONTENT_CLASS).toBe("page-content");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
});
