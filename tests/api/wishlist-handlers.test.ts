import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCompletedWishlistHandler } from "../../src/app/api/wishlist/completed/route";
import { createWishlistDeleteHandler } from "../../src/app/api/wishlist/[id]/route";
import { createWishlistHandlers } from "../../src/app/api/wishlist/route";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("wishlist handlers", () => {
  let client: Client;
  let handlers: ReturnType<typeof createWishlistHandlers>;
  let deleteHandler: ReturnType<typeof createWishlistDeleteHandler>;
  let completedHandler: ReturnType<typeof createCompletedWishlistHandler>;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
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
        'hash-1','https://example.test/recipe-1.jpg','2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-completed-old',NULL,'recipe-1',NULL,'木樨肉','肉类','completed',
        '2026-07-10T00:00:00.000Z','2026-07-11T00:00:00.000Z',NULL,
        '2026-07-10T00:00:00.000Z','2026-07-11T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-completed-new',NULL,NULL,'番茄炒蛋','番茄炒蛋','肉类','completed',
        '2026-07-12T00:00:00.000Z','2026-07-15T00:00:00.000Z',NULL,
        '2026-07-12T00:00:00.000Z','2026-07-15T00:00:00.000Z'
      );
      INSERT INTO wishlist_completions VALUES (
        'completion-old',NULL,'wish-completed-old','recipe-1',NULL,
        '2026-07-10T00:00:00.000Z','2026-07-11T00:00:00.000Z','木樨肉','old.jpg','2026-07-11T00:00:00.000Z'
      );
      INSERT INTO wishlist_completions VALUES (
        'completion-new',NULL,'wish-completed-new',NULL,NULL,
        '2026-07-12T00:00:00.000Z','2026-07-15T00:00:00.000Z','番茄炒蛋','new.jpg','2026-07-15T00:00:00.000Z'
      );
    `);

    const database = drizzle(client);
    handlers = createWishlistHandlers(database);
    deleteHandler = createWishlistDeleteHandler(database);
    completedHandler = createCompletedWishlistHandler(database);
  });

  afterEach(() => client.close());

  it("adds a recipe to the pending wishlist", async () => {
    const response = await handlers.POST(new Request("http://local.test/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: "recipe-1" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      item: {
        recipeId: "recipe-1",
        name: "木樨肉",
        categoryKey: "肉类",
        imageUrl: "https://example.test/recipe-1.jpg",
        status: "pending",
      },
    });
  });

  it("returns 409 and the existing id for a duplicate pending recipe", async () => {
    const request = () => new Request("http://local.test/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: "recipe-1" }),
    });
    const first = await handlers.POST(request());
    const firstBody = await first.json() as { item: { id: string } };

    const duplicate = await handlers.POST(request());

    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toEqual({
      error: "已经在猪猪心愿单里啦",
      itemId: firstBody.item.id,
    });
  });

  it("returns 404 for an unknown recipe", async () => {
    const response = await handlers.POST(new Request("http://local.test/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: "missing" }),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "菜谱不存在" });
  });

  it("lists pending items and both status counts", async () => {
    await handlers.POST(new Request("http://local.test/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: "recipe-1" }),
    }));

    const response = await handlers.GET(new Request("http://local.test/api/wishlist?status=pending"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ recipeId: "recipe-1", name: "木樨肉", status: "pending" }],
      pendingCount: 1,
      completedCount: 2,
    });
  });

  it("deletes a pending item", async () => {
    const created = await handlers.POST(new Request("http://local.test/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: "recipe-1" }),
    }));
    const { item } = await created.json() as { item: { id: string } };

    const response = await deleteHandler(new Request(`http://local.test/api/wishlist/${item.id}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ id: item.id }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    const remaining = await client.execute({
      sql: "SELECT count(*) AS count FROM wishlist_items WHERE id = ?",
      args: [item.id],
    });
    expect(Number(remaining.rows[0].count)).toBe(0);
  });

  it("cannot delete a completed row through the pending delete endpoint", async () => {
    const response = await deleteHandler(new Request("http://local.test/api/wishlist/wish-completed-old", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "wish-completed-old" }) });

    expect(response.status).toBe(404);
    const row = await client.execute("SELECT status FROM wishlist_items WHERE id = 'wish-completed-old'");
    expect(row.rows[0].status).toBe("completed");
  });

  it("lists permanent completion snapshots newest first", async () => {
    const response = await completedHandler();

    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<{ id: string; name: string; imageUrl: string }> };
    expect(body.items.map(({ id }) => id)).toEqual(["completion-new", "completion-old"]);
    expect(body.items[0]).toMatchObject({ name: "番茄炒蛋", imageUrl: "new.jpg" });
  });
});
