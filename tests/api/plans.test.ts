import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPlanHandlers } from "../../src/app/api/plans/route";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("Plans API isolated handlers", () => {
  let client: Client | undefined;
  let tempDirectory: string | undefined;
  let handlers: ReturnType<typeof createPlanHandlers>;
  const today = "2026-07-17";

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "plans-api-"));
    client = createClient({ url: `file:${join(tempDirectory, "test.db")}` });
    await client.executeMultiple(`
      CREATE TABLE categories (
        id integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0, created_at text NOT NULL
      );
      CREATE TABLE dishes (
        id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE, category_id integer,
        image_url text, ingredients text NOT NULL DEFAULT '[]', steps text NOT NULL DEFAULT '[]',
        times_cooked integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE meal_plans (
        id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, meal_type text NOT NULL,
        dish_id text REFERENCES dishes(id), notes text, created_at text NOT NULL
      );
      INSERT INTO dishes VALUES (
        'dish-1','隔离测试菜','隔离测试菜',1,NULL,'[]','[]',0,
        '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
    `);
    await applyRecipesWishlistMigration(client);
    handlers = createPlanHandlers(drizzle(client));
  });

  afterEach(async () => {
    try {
      client?.close();
    } finally {
      if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  function post(mealType: string): Promise<Response> {
    return handlers.POST(new Request("http://local.test/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: today, mealType, dishId: "dish-1" }),
    }));
  }

  it.each(["breakfast", "lunch", "dinner"])("creates a %s dish plan", async (mealType) => {
    const response = await post(mealType);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("rejects missing required fields", async () => {
    const response = await handlers.POST(new Request("http://local.test/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: today, dishId: "dish-1" }),
    }));

    expect(response.status).toBe(400);
  });

  it("returns plans for the selected date with display fields", async () => {
    await post("dinner");

    const response = await handlers.GET(new Request(`http://local.test/api/plans?date=${today}`));
    const plans = await response.json() as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(plans).toMatchObject([{
      date: today,
      mealType: "dinner",
      dishId: "dish-1",
      sourceType: "dish",
      name: "隔离测试菜",
      categoryKey: "肉类",
    }]);
  });

  it("returns empty for a date without plans", async () => {
    const response = await handlers.GET(new Request("http://local.test/api/plans?date=2099-01-01"));

    await expect(response.json()).resolves.toEqual([]);
  });

  it("deletes a plan", async () => {
    await post("lunch");
    const rows = await client!.execute("SELECT id FROM meal_plans");
    const id = Number(rows.rows[0].id);

    const response = await handlers.DELETE(new Request(`http://local.test/api/plans?id=${id}`, { method: "DELETE" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    const remaining = await client!.execute("SELECT id FROM meal_plans");
    expect(remaining.rows).toHaveLength(0);
  });

  it("rejects a delete without id", async () => {
    const response = await handlers.DELETE(new Request("http://local.test/api/plans", { method: "DELETE" }));

    expect(response.status).toBe(400);
  });
});
