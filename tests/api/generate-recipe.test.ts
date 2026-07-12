import { describe, expect, it } from "vitest";

const BASE = "http://localhost:3000";

describe("POST /api/generate-recipe", () => {
  it("拒绝空菜名", async () => {
    const response = await fetch(`${BASE}/api/generate-recipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("Gemini 不可用时仍返回参考菜谱", async () => {
    const response = await fetch(`${BASE}/api/generate-recipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "红烧猪蹄" }),
    });
    const data = await response.json();
    expect(response.ok).toBe(true);
    expect(["gemini", "template"]).toContain(data.source);
    expect(data.ingredients.length).toBeGreaterThan(0);
    expect(data.steps.length).toBeGreaterThan(0);
  }, 20_000);
});
