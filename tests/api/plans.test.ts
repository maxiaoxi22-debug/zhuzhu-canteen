import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:3000";
let testDishId: string;

describe("Plans API", () => {
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    // Create a test dish to use in plan tests
    const res = await fetch(`${BASE}/api/dishes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "pytest_plan_dish",
        categoryId: 1,
        imageUrl: null,
        ingredients: ["test"],
        steps: ["test"],
      }),
    });
    const data = await res.json();
    testDishId = data.id;
  });

  afterAll(async () => {
    if (testDishId) {
      await fetch(`${BASE}/api/dishes?id=${testDishId}`, { method: "DELETE" });
    }
  });

  describe("POST /api/plans", () => {
    it("should create a meal plan for breakfast", async () => {
      const res = await fetch(`${BASE}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          mealType: "breakfast",
          dishId: testDishId,
        }),
      });
      const data = await res.json();
      expect(res.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it("should create a meal plan for lunch", async () => {
      const res = await fetch(`${BASE}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          mealType: "lunch",
          dishId: testDishId,
        }),
      });
      expect(res.ok).toBe(true);
    });

    it("should create a meal plan for dinner", async () => {
      const res = await fetch(`${BASE}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          mealType: "dinner",
          dishId: testDishId,
        }),
      });
      const data = await res.json();
      expect(res.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it("should reject missing required fields", async () => {
      const res = await fetch(`${BASE}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      expect(res.ok).toBe(false);
    });
  });

  describe("GET /api/plans", () => {
    it("should return today's plans", async () => {
      const res = await fetch(`${BASE}/api/plans?date=${today}`);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      if (data.length > 0) {
        expect(data[0].date).toBe(today);
      }
    });

    it("should return empty for a far future date", async () => {
      const res = await fetch(`${BASE}/api/plans?date=2099-01-01`);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });
  });

  describe("DELETE /api/plans", () => {
    it("should delete a meal plan", async () => {
      const getRes = await fetch(`${BASE}/api/plans?date=${today}`);
      const plans = await getRes.json();
      if (plans.length > 0) {
        const res = await fetch(`${BASE}/api/plans?id=${plans[0].id}`, { method: "DELETE" });
        const data = await res.json();
        expect(res.ok).toBe(true);
        expect(data.success).toBe(true);
      }
    });

    it("should reject missing id", async () => {
      const res = await fetch(`${BASE}/api/plans`, { method: "DELETE" });
      expect(res.ok).toBe(false);
    });
  });
});