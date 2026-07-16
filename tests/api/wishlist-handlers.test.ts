import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCompletedWishlistHandler } from "../../src/app/api/wishlist/completed/route";
import { createWishlistDeleteHandler } from "../../src/app/api/wishlist/[id]/route";
import { createWishlistHandlers } from "../../src/app/api/wishlist/route";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";
import {
  addWishlistItem,
  listWishlistCompletions,
  listWishlistItems,
  removePendingWishlistItem,
  type WishlistDatabase,
} from "../../src/lib/wishlist-repository";

describe("wishlist handlers", () => {
  let client: Client | undefined;
  let tempDirectory: string | undefined;
  let database: WishlistDatabase;
  let handlers: ReturnType<typeof createWishlistHandlers>;
  let deleteHandler: ReturnType<typeof createWishlistDeleteHandler>;
  let completedHandler: ReturnType<typeof createCompletedWishlistHandler>;

  function getClient(): Client {
    if (!client) throw new Error("test database client is unavailable");
    return client;
  }

  beforeEach(async () => {
    client = undefined;
    tempDirectory = undefined;
    tempDirectory = await mkdtemp(join(tmpdir(), "wishlist-handlers-"));
    const testClient = createClient({ url: `file:${join(tempDirectory, "test.db")}` });
    client = testClient;
    await testClient.executeMultiple(`
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
    await applyRecipesWishlistMigration(testClient);
    await testClient.executeMultiple(`
      INSERT INTO recipes VALUES (
        'recipe-1','木樨肉','木樨肉','肉类','家常快手菜',2,20,
        'HowToCook','https://example.test/recipe-1','MIT','dishes/meat_dish/木樨肉.md','revision-1',
        'hash-1','https://example.test/recipe-1.jpg','2026-07-17T00:00:00.000Z','2026-07-17T00:00:00.000Z'
      );
      INSERT INTO dishes (
        id,name,name_key,category_id,image_url,ingredients,steps,recipe_id,wishlist_item_id,owner_id,
        times_cooked,created_at,updated_at
      ) VALUES (
        'dish-completed','木樨肉','木樨肉',NULL,'dish.jpg','[]','[]','recipe-1',NULL,NULL,
        1,'2026-07-11T00:00:00.000Z','2026-07-11T00:00:00.000Z'
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
        'completion-old',NULL,'wish-completed-old','recipe-1','dish-completed',
        '2026-07-10T00:00:00.000Z','2026-07-11T00:00:00.000Z','木樨肉','old.jpg','2026-07-11T00:00:00.000Z'
      );
      INSERT INTO wishlist_completions VALUES (
        'completion-new',NULL,'wish-completed-new',NULL,NULL,
        '2026-07-12T00:00:00.000Z','2026-07-15T00:00:00.000Z','番茄炒蛋','new.jpg','2026-07-15T00:00:00.000Z'
      );
    `);

    database = drizzle(testClient);
    handlers = createWishlistHandlers(database);
    deleteHandler = createWishlistDeleteHandler(database);
    completedHandler = createCompletedWishlistHandler(database);
  });

  afterEach(async () => {
    try {
      client?.close();
    } finally {
      if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
    }
  });

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

  it("recovers concurrent duplicate inserts with one shared pending item id", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => addWishlistItem(database, "recipe-1", "owner-race")),
    );
    const created = results.filter((result) => result.kind === "created");
    const duplicates = results.filter((result) => result.kind === "duplicate");

    expect(created).toHaveLength(1);
    expect(duplicates).toHaveLength(4);
    const createdId = created[0].item.id;
    expect(duplicates.every((result) => result.itemId === createdId)).toBe(true);
    const rows = await getClient().execute(
      "SELECT id FROM wishlist_items WHERE owner_id = 'owner-race' AND status = 'pending'",
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(createdId);
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

  it("reads the pending list and both counts in one deferred batch snapshot", async () => {
    const batch = vi.spyOn(database, "batch");

    const response = await handlers.GET(new Request("http://local.test/api/wishlist?status=pending"));

    expect(response.status).toBe(200);
    expect(batch).toHaveBeenCalledOnce();
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
    const remaining = await getClient().execute({
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
    const row = await getClient().execute("SELECT status FROM wishlist_items WHERE id = 'wish-completed-old'");
    expect(row.rows[0].status).toBe("completed");
  });

  it("lists permanent completion snapshots newest first with the linked dish state", async () => {
    const response = await completedHandler();

    expect(response.status).toBe(200);
    const body = await response.json() as {
      items: Array<{ id: string; name: string; imageUrl: string; completedDishId: string | null; dishExists: boolean }>;
    };
    expect(body.items.map(({ id }) => id)).toEqual(["completion-new", "completion-old"]);
    expect(body.items[0]).toMatchObject({
      name: "番茄炒蛋", imageUrl: "new.jpg", completedDishId: null, dishExists: false,
    });
    expect(body.items[1]).toMatchObject({
      name: "木樨肉", imageUrl: "old.jpg", completedDishId: "dish-completed", dishExists: true,
    });

    await getClient().execute("DELETE FROM dishes WHERE id = 'dish-completed'");
    const afterDelete = await listWishlistCompletions(database, null);
    expect(afterDelete.find(({ id }) => id === "completion-old")).toMatchObject({
      name: "木樨肉", imageUrl: "old.jpg", completedDishId: null, dishExists: false,
    });
  });

  it("keeps repository reads, duplicates, and deletes isolated by owner", async () => {
    const anonymous = await addWishlistItem(database, "recipe-1", null);
    const ownerA = await addWishlistItem(database, "recipe-1", "owner-a");
    const ownerB = await addWishlistItem(database, "recipe-1", "owner-b");
    const anonymousDuplicate = await addWishlistItem(database, "recipe-1", null);
    const ownerADuplicate = await addWishlistItem(database, "recipe-1", "owner-a");
    if (anonymous.kind !== "created" || ownerA.kind !== "created" || ownerB.kind !== "created") {
      throw new Error("owner isolation setup failed");
    }
    expect(new Set([anonymous.item.id, ownerA.item.id, ownerB.item.id]).size).toBe(3);
    expect(anonymousDuplicate).toMatchObject({ kind: "duplicate", itemId: anonymous.item.id });
    expect(ownerADuplicate).toMatchObject({ kind: "duplicate", itemId: ownerA.item.id });

    await getClient().executeMultiple(`
      INSERT INTO wishlist_items VALUES (
        'wish-owner-a-completed','owner-a',NULL,'A 完成菜','A 完成菜','肉类','completed',
        '2026-07-12T00:00:00.000Z','2026-07-16T00:00:00.000Z',NULL,
        '2026-07-12T00:00:00.000Z','2026-07-16T00:00:00.000Z'
      );
      INSERT INTO wishlist_completions VALUES (
        'completion-owner-a','owner-a','wish-owner-a-completed',NULL,NULL,
        '2026-07-12T00:00:00.000Z','2026-07-16T00:00:00.000Z','A 完成菜',NULL,'2026-07-16T00:00:00.000Z'
      );
    `);

    const anonymousList = await listWishlistItems(database, null);
    const ownerAList = await listWishlistItems(database, "owner-a");
    const ownerBList = await listWishlistItems(database, "owner-b");
    expect(anonymousList).toMatchObject({ pendingCount: 1, completedCount: 2 });
    expect(ownerAList).toMatchObject({ pendingCount: 1, completedCount: 1 });
    expect(ownerBList).toMatchObject({ pendingCount: 1, completedCount: 0 });
    expect(await listWishlistCompletions(database, null)).toHaveLength(2);
    expect(await listWishlistCompletions(database, "owner-a")).toHaveLength(1);
    expect(await listWishlistCompletions(database, "owner-b")).toHaveLength(0);

    expect(await removePendingWishlistItem(database, ownerA.item.id, null)).toBe(false);
    expect(await removePendingWishlistItem(database, ownerA.item.id, "owner-b")).toBe(false);
    expect(await removePendingWishlistItem(database, ownerA.item.id, "owner-a")).toBe(true);
  });
});
