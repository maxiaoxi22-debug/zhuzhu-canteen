import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHistoryHandler } from "../../src/app/api/history/route";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("GET /api/history", () => {
  let client: Client | undefined;
  let tempDirectory: string | undefined;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "history-handler-"));
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
      INSERT INTO dishes (
        id,name,name_key,category_id,image_url,ingredients,steps,recipe_id,wishlist_item_id,owner_id,
        times_cooked,created_at,updated_at
      ) VALUES (
        'dish-1','后来改名的排骨','后来改名的排骨',1,'current.jpg','[]','[]',NULL,NULL,NULL,
        1,'2026-07-01T08:00:00.000Z','2026-07-01T08:00:00.000Z'
      );
      INSERT INTO meal_plans (
        date,meal_type,dish_id,recipe_id,wishlist_item_id,source_type,owner_id,notes,created_at
      ) VALUES (
        '2026-07-15','dinner','dish-1',NULL,NULL,'dish',NULL,NULL,'2026-07-15T10:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-pending',NULL,NULL,'鱼香肉丝','鱼香肉丝','肉类','pending',
        '2026-07-14T00:00:00.000Z',NULL,NULL,'2026-07-14T00:00:00.000Z','2026-07-14T00:00:00.000Z'
      );
      INSERT INTO wishlist_items VALUES (
        'wish-completed',NULL,NULL,'糖醋排骨','糖醋排骨','肉类','completed',
        '2026-07-10T00:00:00.000Z','2026-07-16T12:00:00.000Z','dish-1',
        '2026-07-10T00:00:00.000Z','2026-07-16T12:00:00.000Z'
      );
      INSERT INTO wishlist_completions VALUES (
        'completion-1',NULL,'wish-completed',NULL,'dish-1','2026-07-10T00:00:00.000Z',
        '2026-07-16T12:00:00.000Z','糖醋排骨','snapshot.jpg','2026-07-16T12:00:00.000Z'
      );
    `);
  });

  afterEach(async () => {
    client?.close();
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  });

  it("returns merged events and wishlist counts from an isolated database", async () => {
    if (!client) throw new Error("test database client is unavailable");
    const GET = createHistoryHandler(drizzle(client));
    const response = await GET(new Request("http://local.test/api/history"));
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.events.map((event: { type: string }) => event.type)).toEqual([
      "wishlist_completed",
      "meal_planned",
      "dish_created",
    ]);
    expect(data.events[0]).toMatchObject({ nameSnapshot: "糖醋排骨", imageUrlSnapshot: "snapshot.jpg" });
    expect(data.wishlistSummary).toEqual({ pending: 1, completed: 1 });
  });
});
