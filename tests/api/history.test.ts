import { describe, expect, it } from "vitest";

describe("GET /api/history", () => {
  it("合并菜品创建和点餐事件并按时间倒序", async () => {
    const response = await fetch("http://localhost:3000/api/history");
    const data = await response.json();
    expect(response.ok).toBe(true);
    expect(data.events.some((event: { type: string }) => event.type === "dish_created")).toBe(true);
    expect(data.events.some((event: { type: string }) => event.type === "meal_planned")).toBe(true);
    expect(data.events.some((event: { dish: { name: string } }) => event.dish.name === "红烧猪蹄")).toBe(true);
    expect(data.events.some((event: { dish: { name: string } }) => event.dish.name === "红烧鲫鱼")).toBe(true);
    const times = data.events.map((event: { eventTime: string }) => new Date(event.eventTime).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  }, 20_000);
});
