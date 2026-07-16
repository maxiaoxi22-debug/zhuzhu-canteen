import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPlanHandlers } from "../../src/app/api/plans/route";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("plans source validation", () => {
  let client: Client | undefined;
  let tempDirectory: string | undefined;
  let handlers: ReturnType<typeof createPlanHandlers>;

  const request = (body: Record<string, unknown>) => new Request("http://local.test/api/plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: "2026-07-17", mealType: "dinner", ...body }),
  });

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "plans-source-"));
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
    `);
    await applyRecipesWishlistMigration(client);
    await client.executeMultiple(`
      INSERT INTO recipes VALUES (
        'recipe-1','木樨肉','木樨肉','肉类','家常快手菜',2,20,
        'HowToCook','https://example.test/recipe-1','MIT','dishes/meat_dish/木樨肉.md','revision-1',
        'hash-1','recipe.jpg','2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-pending',NULL,'recipe-1',NULL,'木樨肉','肉类','pending',
        '2026-07-17T00:00:00.000Z',NULL,NULL,
        '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-completed',NULL,'recipe-1',NULL,'木樨肉','肉类','completed',
        '2026-07-10T00:00:00.000Z','2026-07-11T00:00:00.000Z',NULL,
        '2026-07-10T00:00:00.000Z','2026-07-11T00:00:00.000Z'
      );
      INSERT INTO dishes (
        id,name,name_key,category_id,image_url,ingredients,steps,recipe_id,wishlist_item_id,owner_id,
        times_cooked,created_at,updated_at
      ) VALUES (
        'dish-1','现有菜','现有菜',1,NULL,'[]','[]',NULL,NULL,NULL,3,
        '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO dishes (
        id,name,name_key,category_id,image_url,ingredients,steps,recipe_id,wishlist_item_id,owner_id,
        times_cooked,created_at,updated_at
      ) VALUES (
        'dish-owned','别人的菜','别人的菜',1,NULL,'[]','[]',NULL,NULL,'owner-a',0,
        '2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
    `);
    handlers = createPlanHandlers(drizzle(client));
  });

  afterEach(async () => {
    try {
      client?.close();
    } finally {
      if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    { body: {}, description: "neither source id" },
    { body: { dishId: "dish-1", wishlistItemId: "wish-pending" }, description: "both source ids" },
  ])("rejects $description", async ({ body }) => {
    const response = await handlers.POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "只能选择饭盆菜品或心愿菜中的一种" });
  });

  it("creates a wishlist plan by copying the verified pending wish recipe id", async () => {
    const response = await handlers.POST(request({ wishlistItemId: "wish-pending" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    const plan = await client!.execute("SELECT * FROM meal_plans");
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      dish_id: null,
      recipe_id: "recipe-1",
      wishlist_item_id: "wish-pending",
      source_type: "wishlist",
    });
  });

  it.each(["dish-missing", "dish-owned"])("rejects unavailable dish %s before inserting", async (dishId) => {
    const response = await handlers.POST(request({ dishId }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "饭盆菜品不存在" });
    const plans = await client!.execute("SELECT id FROM meal_plans");
    expect(plans.rows).toHaveLength(0);
  });

  it("does not complete the wish, create a dish, completion event, or increment counts", async () => {
    await handlers.POST(request({ wishlistItemId: "wish-pending" }));

    const wish = await client!.execute("SELECT status, completed_at FROM wishlist_items WHERE id = 'wish-pending'");
    const dishes = await client!.execute("SELECT id, times_cooked FROM dishes WHERE id = 'dish-1'");
    const completions = await client!.execute("SELECT id FROM wishlist_completions");
    expect(wish.rows[0]).toMatchObject({ status: "pending", completed_at: null });
    expect(dishes.rows).toEqual([expect.objectContaining({ id: "dish-1", times_cooked: 3 })]);
    expect(completions.rows).toHaveLength(0);
  });

  it("rejects a completed or missing wishlist item", async () => {
    for (const wishlistItemId of ["wish-completed", "wish-missing"]) {
      const response = await handlers.POST(request({ wishlistItemId }));
      expect(response.status).toBe(404);
    }
    const plans = await client!.execute("SELECT id FROM meal_plans");
    expect(plans.rows).toHaveLength(0);
  });
});
