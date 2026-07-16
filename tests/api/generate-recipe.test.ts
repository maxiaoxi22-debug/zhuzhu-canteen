import { describe, expect, it, vi } from "vitest";
import { createGenerateRecipeHandler } from "../../src/app/api/generate-recipe/route";

function request(name: string): Request {
  return new Request("http://local.test/api/generate-recipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

describe("POST /api/generate-recipe", () => {
  it("拒绝空菜名且不调用 Gemini", async () => {
    const generate = vi.fn();
    const response = await createGenerateRecipeHandler(generate)(request("  "));

    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("保留按菜名生成参考用量和步骤的旧功能", async () => {
    const generate = vi.fn().mockResolvedValue({
      category: "肉类",
      ingredients: ["排骨 500 克"],
      steps: ["小火炖煮"],
    });
    const response = await createGenerateRecipeHandler(generate)(request(" 红烧排骨 "));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: "红烧排骨",
      category: "肉类",
      ingredients: ["排骨 500 克"],
      steps: ["小火炖煮"],
      source: "gemini",
    });
  });

  it("Gemini 不可用时仍返回参考菜谱", async () => {
    const response = await createGenerateRecipeHandler(
      vi.fn().mockRejectedValue(new Error("offline")),
    )(request("红烧猪蹄"));
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.source).toBe("template");
    expect(data.ingredients.length).toBeGreaterThan(0);
    expect(data.steps.length).toBeGreaterThan(0);
  });
});
