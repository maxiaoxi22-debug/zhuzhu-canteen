import { describe, expect, it } from "vitest";
import { categoryIdFromKey, readDishSaveResult } from "../../src/lib/dish-form";

describe("菜品表单数据处理", () => {
  it("把六个分类名称映射为数据库 ID 1 到 6", () => {
    expect(categoryIdFromKey("肉类")).toBe(1);
    expect(categoryIdFromKey("青菜")).toBe(2);
    expect(categoryIdFromKey("主食")).toBe(3);
    expect(categoryIdFromKey("海鲜")).toBe(4);
    expect(categoryIdFromKey("汤类")).toBe(5);
    expect(categoryIdFromKey("其他")).toBe(6);
  });

  it("保存接口失败时抛出服务端错误，不允许表单误报成功", async () => {
    const response = new Response(JSON.stringify({ error: "数据库连接失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readDishSaveResult(response)).rejects.toThrow("数据库连接失败");
  });

  it("保存成功时返回新菜品 ID", async () => {
    const response = new Response(JSON.stringify({ id: "dish-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readDishSaveResult(response)).resolves.toEqual({ id: "dish-1" });
  });

  it("重复冲突时保留匹配菜品信息", async () => {
    const match = { id: "1", name: "红烧肉", imageUrl: null, kind: "exact", message: "菜单库已有这道菜" };
    const response = new Response(JSON.stringify({ error: match.message, match }), { status: 409 });
    await expect(readDishSaveResult(response)).rejects.toMatchObject({
      message: "菜单库已有这道菜",
      match: { id: "1" },
    });
  });
});
