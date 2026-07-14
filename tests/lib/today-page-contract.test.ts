import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("菜单页", () => {
  it("采用猪猪推荐样式并保留真实三餐请求", () => {
    const source = readFileSync(new URL("../../src/components/TodayPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("让猪猪帮你决定");
    expect(source).toContain("猪猪随机推荐");
    expect(source).toContain('fetch("/api/plans"');
    expect(source).toContain('method: "POST"');
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("refresh()");
    expect(source).toContain("换一道，让猪猪再想想");
  });
});
