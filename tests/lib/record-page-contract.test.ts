import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("首页菜品卡片", () => {
  it("不展示占据卡片空间的三点按钮", () => {
    const source = readFileSync(new URL("../../src/components/RecordPage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("更多操作");
    expect(source).not.toContain(">···</button>");
  });

  it("保留原交互并接入猪猪投喂流程", () => {
    const source = readFileSync(new URL("../../src/components/RecordPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("PigHero");
    expect(source).toContain("increaseSatiety");
    expect(source).toContain("onAddClick");
    expect(source).toContain("DishActionMenu");
    expect(source).toContain("IntersectionObserver");
    expect(source).toContain("继续下滑加载更多");
    expect(source).toContain("今天喂猪猪了吗？");
  });
});
