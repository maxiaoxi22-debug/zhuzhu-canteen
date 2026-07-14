import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("菜单库滑动行", () => {
  it("阻止文字和图片原生拖动抢占右滑手势", () => {
    const source = readFileSync(new URL("../../src/components/SwipeableDishRow.tsx", import.meta.url), "utf8");
    expect(source).toContain("select-none");
    expect(source).toContain("onDragStart={(event) => event.preventDefault()}");
  });

  it("不使用会在松手时立即关闭滑动行的全页面点击监听", () => {
    const source = readFileSync(new URL("../../src/components/LibraryPage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('document.addEventListener("click", close)');
  });
});
