import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("首页菜品卡片", () => {
  it("不展示占据卡片空间的三点按钮", () => {
    const source = readFileSync(new URL("../../src/components/RecordPage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("更多操作");
    expect(source).not.toContain(">···</button>");
  });
});
