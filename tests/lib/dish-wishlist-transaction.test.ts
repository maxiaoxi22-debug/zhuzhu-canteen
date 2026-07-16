import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findCompletionCandidate,
  saveDishAndMaybeCompleteWish,
  type DishWishlistDatabase,
} from "../../src/lib/dish-wishlist-transaction";

describe("dish plus wishlist transaction", () => {
  let client: Client | undefined;
  let tempDirectory: string | undefined;
  let database: DishWishlistDatabase;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "dish-wish-transaction-"));
    client = createClient({ url: `file:${join(tempDirectory, "test.db")}` });
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE categories (id integer PRIMARY KEY, name text NOT NULL);
      CREATE TABLE recipes (
        id text PRIMARY KEY, name text NOT NULL, name_key text NOT NULL, category_key text NOT NULL,
        image_url text
      );
      CREATE TABLE dishes (
        id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE, category_id integer,
        image_url text, ingredients text NOT NULL DEFAULT '[]', steps text NOT NULL DEFAULT '[]',
        recipe_id text REFERENCES recipes(id), wishlist_item_id text REFERENCES wishlist_items(id),
        owner_id text, times_cooked integer NOT NULL DEFAULT 0,
        created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE wishlist_items (
        id text PRIMARY KEY, owner_id text, recipe_id text REFERENCES recipes(id), custom_name text,
        name_key text NOT NULL, category_key text NOT NULL, status text NOT NULL,
        added_at text NOT NULL, completed_at text, completed_dish_id text REFERENCES dishes(id),
        created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE wishlist_completions (
        id text PRIMARY KEY, owner_id text, wishlist_item_id text NOT NULL REFERENCES wishlist_items(id),
        recipe_id text REFERENCES recipes(id), completed_dish_id text REFERENCES dishes(id),
        added_at_snapshot text NOT NULL, completed_at text NOT NULL, name_snapshot text NOT NULL,
        image_url_snapshot text, created_at text NOT NULL
      );
      INSERT INTO categories VALUES (1, '肉类'), (2, '青菜');
      INSERT INTO recipes VALUES ('recipe-1', '木樨肉', '木樨肉', '肉类', 'recipe.jpg');
      INSERT INTO wishlist_items VALUES (
        'wish-1', 'owner-a', 'recipe-1', NULL, '木樨肉', '肉类', 'pending',
        '2026-07-01T00:00:00.000Z', NULL, NULL,
        '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-custom', 'owner-a', NULL, '番茄炒蛋', '番茄炒蛋', '肉类', 'pending',
        '2026-07-02T00:00:00.000Z', NULL, NULL,
        '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z'
      );
    `);
    database = drizzle(client);
  });

  afterEach(async () => {
    try {
      client?.close();
    } finally {
      if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  const request = () => ({
    name: "木樨肉",
    categoryId: 1,
    imageUrl: "cooked.jpg",
    ingredients: ["鸡蛋"],
    steps: ["炒熟"],
    recipeId: "recipe-1",
    wishlistItemId: "wish-1",
    completeWishlist: true,
    ownerId: "owner-a",
  });

  async function scalar(sql: string): Promise<number> {
    const result = await client!.execute(sql);
    return Number(result.rows[0].value);
  }

  it("finds a pending candidate by recipe before normalized name and category", async () => {
    await expect(findCompletionCandidate(database, {
      recipeId: "recipe-1",
      name: "随便的菜名",
      categoryId: 2,
      ownerId: "owner-a",
    })).resolves.toMatchObject({ id: "wish-1", name: "木樨肉", imageUrl: "recipe.jpg" });

    await expect(findCompletionCandidate(database, {
      name: "番 茄炒蛋",
      categoryId: 1,
      ownerId: "owner-a",
    })).resolves.toMatchObject({ id: "wish-custom", name: "番茄炒蛋" });
  });

  it("atomically inserts the dish, updates the pending wish, and writes a server snapshot", async () => {
    const result = await saveDishAndMaybeCompleteWish(database, request());

    expect(result.wishlistCompletion).toMatchObject({
      id: "wish-1",
      name: "木樨肉",
      imageUrl: "cooked.jpg",
    });
    const wish = await client!.execute("SELECT status, completed_dish_id FROM wishlist_items WHERE id='wish-1'");
    expect(wish.rows[0]).toMatchObject({ status: "completed", completed_dish_id: result.id });
    const dish = await client!.execute({ sql: "SELECT wishlist_item_id FROM dishes WHERE id = ?", args: [result.id] });
    expect(dish.rows[0].wishlist_item_id).toBe("wish-1");
    const snapshot = await client!.execute("SELECT name_snapshot, image_url_snapshot FROM wishlist_completions");
    expect(snapshot.rows[0]).toMatchObject({ name_snapshot: "木樨肉", image_url_snapshot: "cooked.jpg" });
  });

  it("rolls back dish creation when completion insert fails", async () => {
    await expect(saveDishAndMaybeCompleteWish(database, request(), { failAfterWishUpdate: true }))
      .rejects.toThrow("forced completion failure");

    expect(await scalar("SELECT count(*) AS value FROM dishes")).toBe(0);
    const wish = await client!.execute("SELECT status FROM wishlist_items WHERE id='wish-1'");
    expect(wish.rows[0].status).toBe("pending");
    expect(await scalar("SELECT count(*) AS value FROM wishlist_completions")).toBe(0);
  });

  it("saves only the dish when completion is declined", async () => {
    const result = await saveDishAndMaybeCompleteWish(database, { ...request(), completeWishlist: false });

    expect(result.wishlistCompletion).toBeUndefined();
    const wish = await client!.execute("SELECT status FROM wishlist_items WHERE id='wish-1'");
    expect(wish.rows[0].status).toBe("pending");
    expect(await scalar("SELECT count(*) AS value FROM wishlist_completions")).toBe(0);
  });

  it("ignores an invalid or cross-owner completion target while saving the dish", async () => {
    const result = await saveDishAndMaybeCompleteWish(database, {
      ...request(),
      wishlistItemId: "wish-custom",
      ownerId: "owner-b",
    });

    expect(result.wishlistCompletion).toBeUndefined();
    expect(await scalar("SELECT count(*) AS value FROM dishes")).toBe(1);
    expect(await scalar("SELECT count(*) AS value FROM wishlist_completions")).toBe(0);
  });

  it("rejects an unknown recipe before creating a dish", async () => {
    await expect(saveDishAndMaybeCompleteWish(database, { ...request(), recipeId: "missing" }))
      .rejects.toMatchObject({ code: "recipe-not-found" });
    expect(await scalar("SELECT count(*) AS value FROM dishes")).toBe(0);
  });

  it("rejects duplicate normalized names before creating a dish", async () => {
    await saveDishAndMaybeCompleteWish(database, { ...request(), completeWishlist: false });
    await expect(saveDishAndMaybeCompleteWish(database, {
      ...request(),
      name: "木 樨 肉",
      wishlistItemId: undefined,
      completeWishlist: false,
    })).rejects.toMatchObject({ code: "duplicate" });
    expect(await scalar("SELECT count(*) AS value FROM dishes")).toBe(1);
  });

  it("does not complete a wish that stops matching after the dish insert", async () => {
    await client!.execute(`
      CREATE TRIGGER change_wish_category AFTER INSERT ON dishes
      BEGIN
        UPDATE wishlist_items SET recipe_id = NULL, category_key = '青菜' WHERE id = 'wish-1';
      END
    `);

    const result = await saveDishAndMaybeCompleteWish(database, request());

    expect(result.wishlistCompletion).toBeUndefined();
    const wish = await client!.execute("SELECT status FROM wishlist_items WHERE id='wish-1'");
    expect(wish.rows[0].status).toBe("pending");
    expect(await scalar("SELECT count(*) AS value FROM wishlist_completions")).toBe(0);
  });

  it("writes the wish name reread inside the transaction into the snapshot", async () => {
    await client!.execute(`
      CREATE TRIGGER rename_wish AFTER INSERT ON dishes
      BEGIN
        UPDATE wishlist_items SET custom_name = '木樨肉（新版）' WHERE id = 'wish-1';
      END
    `);

    const result = await saveDishAndMaybeCompleteWish(database, request());

    expect(result.wishlistCompletion?.name).toBe("木樨肉（新版）");
    const snapshot = await client!.execute("SELECT name_snapshot FROM wishlist_completions");
    expect(snapshot.rows[0].name_snapshot).toBe("木樨肉（新版）");
  });
});
