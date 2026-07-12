import { describe, expect, it } from "vitest";

const BASE = "http://localhost:3000";

describe("PUT /api/dishes/[id]", () => {
  it("只更新允许字段并保留受保护字段", async () => {
    const created = await fetch(`${BASE}/api/dishes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "pytest_待编辑", categoryId: 1, imageUrl: "old.jpg", ingredients: ["旧食材"], steps: ["旧步骤"] }),
    }).then((response) => response.json());

    try {
      const before = await fetch(`${BASE}/api/dishes/${created.id}`).then((response) => response.json());
      const response = await fetch(`${BASE}/api/dishes/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "pytest_已编辑", categoryId: 4, imageUrl: "new.jpg",
          ingredients: ["新食材"], steps: ["新步骤"],
          id: "forged", createdAt: "2000-01-01", timesCooked: 999,
        }),
      });
      expect(response.ok).toBe(true);
      const after = await fetch(`${BASE}/api/dishes/${created.id}`).then((result) => result.json());
      expect(after.name).toBe("pytest_已编辑");
      expect(after.ingredients).toBe('["新食材"]');
      expect(after.id).toBe(created.id);
      expect(after.createdAt).toBe(before.createdAt);
      expect(after.timesCooked).toBe(before.timesCooked);
    } finally {
      await fetch(`${BASE}/api/dishes?id=${created.id}`, { method: "DELETE" });
    }
  }, 30_000);
});
