import { describe, expect, it } from "vitest";
import { nextVisibleDishCount } from "../../src/lib/home-pagination";

describe("首页分批展示", () => {
  it("每次增加 6 道", () => {
    expect(nextVisibleDishCount(6, 20)).toBe(12);
  });

  it("不超过总数", () => {
    expect(nextVisibleDishCount(12, 14)).toBe(14);
  });

  it("小数据集直接展示全部", () => {
    expect(nextVisibleDishCount(0, 4)).toBe(4);
  });
});
