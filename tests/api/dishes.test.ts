/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterAll } from "vitest";

const BASE = "http://localhost:3000";
const createdIds: string[] = [];

async function createDish(overrides: Record<string, any> = {}) {
  const res = await fetch(`${BASE}/api/dishes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "pytest_dish",
      categoryId: 1,
      imageUrl: null,
      ingredients: ["食材A", "食材B"],
      steps: ["步骤1", "步骤2"],
      ...overrides,
    }),
  });
  const data = await res.json();
  if (data.id) createdIds.push(data.id);
  return { res, data };
}

describe("Dishes API", () => {
  afterAll(async () => {
    for (const id of createdIds) {
      try { await fetch(`${BASE}/api/dishes?id=${id}`, { method: "DELETE" }); } catch {}
    }
  });

  describe("POST /api/dishes", () => {
    it("should create a dish with valid data", async () => {
      const { res, data } = await createDish({ name: "pytest_红烧排骨" });
      expect(res.ok).toBe(true);
      expect(data.id).toBeDefined();
    });

    it("should create a dish with null categoryId", async () => {
      const { data } = await createDish({ name: "pytest_无分类菜", categoryId: null });
      expect(data.id).toBeDefined();
    });

    it("should create a dish with empty ingredients and steps", async () => {
      const { data } = await createDish({ name: "pytest_空白菜", ingredients: [], steps: [] });
      expect(data.id).toBeDefined();
    });

    it("should create a dish with long name", async () => {
      const { data } = await createDish({ name: "pytest_这是一个非常长的菜品名称用来测试边界条件" });
      expect(data.id).toBeDefined();
    });

    it("should reject empty name", async () => {
      const { res, data } = await createDish({ name: "" });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it("should reject missing name", async () => {
      const { res, data } = await createDish({ name: undefined });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
    });

    it("should reject whitespace-only name", async () => {
      const { res, data } = await createDish({ name: "   " });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/dishes", () => {
    it("should return an array", async () => {
      const res = await fetch(`${BASE}/api/dishes`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("should be sorted by createdAt desc", async () => {
      const res = await fetch(`${BASE}/api/dishes`);
      const data = await res.json();
      if (data.length >= 2) {
        const dates = data.map((d: any) => new Date(d.createdAt).getTime());
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
        }
      }
    });

    it("should filter by category", async () => {
      const res = await fetch(`${BASE}/api/dishes?cat=1`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      for (const d of data) {
        expect(d.categoryId).toBe(1);
      }
    });

    it("should return empty for non-existent category", async () => {
      const res = await fetch(`${BASE}/api/dishes?cat=999`);
      const data = await res.json();
      expect(data.length).toBe(0);
    });

    it("should search by name", async () => {
      const res = await fetch(`${BASE}/api/dishes?q=pytest`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      for (const d of data) {
        expect(d.name).toContain("pytest");
      }
    });
  });
});
