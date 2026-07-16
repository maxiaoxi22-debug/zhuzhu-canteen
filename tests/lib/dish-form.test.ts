import { describe, expect, it } from "vitest";
import {
  applyRecognitionCandidate,
  buildWishlistCompletionFields,
  categoryIdFromKey,
  createLatestTaskGuard,
  createPendingSaveSnapshot,
  readDishSaveResult,
  saveDishOnce,
} from "../../src/lib/dish-form";

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

  it("只接受服务端成功响应里的心愿完成庆祝数据", async () => {
    const response = new Response(JSON.stringify({
      id: "dish-1",
      wishlistCompletion: { id: "wish-1", name: "木樨肉", imageUrl: "cooked.jpg" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });

    await expect(readDishSaveResult(response)).resolves.toEqual({
      id: "dish-1",
      wishlistCompletion: { id: "wish-1", name: "木樨肉", imageUrl: "cooked.jpg" },
    });
  });

  it("重复冲突时保留匹配菜品信息", async () => {
    const match = { id: "1", name: "红烧肉", imageUrl: null, kind: "exact", message: "菜单库已有这道菜" };
    const response = new Response(JSON.stringify({ error: match.message, match }), { status: 409 });
    await expect(readDishSaveResult(response)).rejects.toMatchObject({
      message: "菜单库已有这道菜",
      match: { id: "1" },
    });
  });

  it("候选点击只在分类未被用户触碰时应用识别分类", () => {
    expect(applyRecognitionCandidate("青菜", false, { name: "木樨肉", category: "肉类" }))
      .toEqual({ name: "木樨肉", category: "肉类" });
    expect(applyRecognitionCandidate("青菜", true, { name: "木樨肉", category: "肉类" }))
      .toEqual({ name: "木樨肉", category: "青菜" });
  });

  it("快速连续选择图片时只有最新任务可以提交状态", async () => {
    const guard = createLatestTaskGuard();
    const first = guard.begin();
    const second = guard.begin();
    let committedUrl = "";
    const finish = (revision: number, url: string) => {
      if (guard.isCurrent(revision)) committedUrl = url;
    };

    finish(second, "new.jpg");
    finish(first, "old-late.jpg");

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    expect(committedUrl).toBe("new.jpg");
  });

  it("选择新图片后忽略上一张图片晚返回的识别结果", () => {
    const guard = createLatestTaskGuard();
    guard.begin();
    const recognitionRevision = guard.current();
    guard.begin();

    expect(guard.isCurrent(recognitionRevision)).toBe(false);
  });

  it("把菜谱关联复制进不可变保存快照", () => {
    const snapshot = createPendingSaveSnapshot(3, {
      name: "木樨肉",
      categoryId: 1,
      categoryKey: "肉类",
      imageUrl: "dish.jpg",
      ingredients: ["鸡蛋"],
      steps: ["炒熟"],
      recipeId: "recipe-1",
      photoUploadId: "upload-1",
      photoUploadToken: "token-1",
    });

    expect(snapshot.recipeId).toBe("recipe-1");
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("两种心愿确认选择生成明确且互斥的服务端字段", () => {
    const candidate = { id: "wish-1", recipeId: "recipe-1" };
    expect(buildWishlistCompletionFields(candidate, true)).toEqual({
      recipeId: "recipe-1", wishlistItemId: "wish-1", completeWishlist: true,
    });
    expect(buildWishlistCompletionFields(candidate, false)).toEqual({
      recipeId: "recipe-1", wishlistItemId: "wish-1", completeWishlist: false,
    });
  });

  it("一次保存只发送一个 POST 且只返回成功响应里的庆祝数据", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response(JSON.stringify({
        id: "dish-1",
        wishlistCompletion: { id: "wish-1", name: "木樨肉", imageUrl: "cooked.jpg" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await saveDishOnce(fetcher, "/api/dishes", "POST", { name: "木樨肉" });

    expect(calls).toBe(1);
    expect(result.wishlistCompletion?.id).toBe("wish-1");
  });

  it("保存失败不返回庆祝数据", async () => {
    const fetcher = async () => new Response(JSON.stringify({ error: "事务失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });

    await expect(saveDishOnce(fetcher, "/api/dishes", "POST", {})).rejects.toThrow("事务失败");
  });
});
