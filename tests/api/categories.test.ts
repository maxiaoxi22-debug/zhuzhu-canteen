import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000";

describe("Categories API", () => {
  describe("GET /api/categories", () => {
    it("should return seeded status", async () => {
      const res = await fetch(`${BASE}/api/categories`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty("count");
      expect(data.count).toBeGreaterThanOrEqual(6);
    });
  });
});