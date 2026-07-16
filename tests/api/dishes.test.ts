import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDishHandlers } from "../../src/app/api/dishes/route";
import type { DishWishlistDatabase } from "../../src/lib/dish-wishlist-transaction";

describe("Dishes API isolated handlers", () => {
  let client: Client | undefined;
  let tempDirectory: string | undefined;
  let handlers: ReturnType<typeof createDishHandlers>;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "dishes-api-"));
    client = createClient({ url: `file:${join(tempDirectory, "test.db")}` });
    await client.executeMultiple(`
      CREATE TABLE categories (id integer PRIMARY KEY, name text NOT NULL);
      CREATE TABLE recipes (id text PRIMARY KEY, name text NOT NULL, name_key text NOT NULL, category_key text NOT NULL, image_url text);
      CREATE TABLE dishes (
        id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE, category_id integer,
        image_url text, ingredients text NOT NULL DEFAULT '[]', steps text NOT NULL DEFAULT '[]',
        recipe_id text, wishlist_item_id text, owner_id text, times_cooked integer NOT NULL DEFAULT 0,
        created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE wishlist_items (
        id text PRIMARY KEY, owner_id text, recipe_id text, custom_name text, name_key text NOT NULL,
        category_key text NOT NULL, status text NOT NULL, added_at text NOT NULL, completed_at text,
        completed_dish_id text, created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE wishlist_completions (
        id text PRIMARY KEY, owner_id text, wishlist_item_id text NOT NULL, recipe_id text,
        completed_dish_id text, added_at_snapshot text NOT NULL, completed_at text NOT NULL,
        name_snapshot text NOT NULL, image_url_snapshot text, created_at text NOT NULL
      );
      INSERT INTO categories VALUES (1, '肉类');
      INSERT INTO recipes VALUES ('recipe-1', '木樨肉', '木樨肉', '肉类', 'recipe.jpg');
      INSERT INTO wishlist_items VALUES (
        'wish-1', NULL, 'recipe-1', NULL, '木樨肉', '肉类', 'pending',
        '2026-07-01T00:00:00.000Z', NULL, NULL,
        '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
      );
    `);
    handlers = createDishHandlers(drizzle(client) as DishWishlistDatabase);
  });

  afterEach(async () => {
    try {
      client?.close();
    } finally {
      if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  function post(overrides: Record<string, unknown> = {}): Promise<Response> {
    return handlers.POST(new Request("http://local.test/api/dishes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "木樨肉",
        categoryId: 1,
        imageUrl: "cooked.jpg",
        ingredients: ["鸡蛋"],
        steps: ["炒熟"],
        ...overrides,
      }),
    }));
  }

  it("creates a dish without touching a pending wish by default", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: expect.any(String) });
    const wish = await client!.execute("SELECT status FROM wishlist_items WHERE id='wish-1'");
    expect(wish.rows[0].status).toBe("pending");
  });

  it("returns a server-owned celebration payload only after atomic completion", async () => {
    const response = await post({
      recipeId: "recipe-1",
      wishlistItemId: "wish-1",
      completeWishlist: true,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: expect.any(String),
      wishlistCompletion: { id: "wish-1", name: "木樨肉", imageUrl: "cooked.jpg" },
    });
  });

  it("rejects invalid names and recipes", async () => {
    expect((await post({ name: "   " })).status).toBe(400);
    expect((await post({ recipeId: "missing" })).status).toBe(400);
  });

  it("returns a 409 with duplicate match details", async () => {
    expect((await post()).status).toBe(200);
    const duplicate = await post({ name: "木 樨 肉" });

    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: "菜单库已有这道菜",
      match: { name: "木樨肉" },
    });
  });

  it("lists dishes from the injected database", async () => {
    await post({ name: "隔离测试菜" });
    const response = await handlers.GET(new Request("http://local.test/api/dishes?q=隔离"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject([{ name: "隔离测试菜" }]);
  });
});
