import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyRecipesWishlistMigration } from "../../src/db/migrate";
import type { createDatabase } from "../../src/db";
import { saveDishAndMaybeCompleteWish } from "../../src/lib/dish-wishlist-transaction";
import {
  acquirePhotoUploadForCleanup,
  createPhotoUploadReservation,
} from "../../src/lib/photo-upload-reservation";

describe("dish photo upload reservation races", () => {
  let client: Client;
  let database: ReturnType<typeof createDatabase>;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "photo-reservation-"));
    client = createClient({ url: `file:${join(directory, "test.db")}` });
    await client.executeMultiple(`
      CREATE TABLE categories (id integer PRIMARY KEY, name text NOT NULL);
      CREATE TABLE dishes (
        id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE, category_id integer,
        image_url text, ingredients text NOT NULL DEFAULT '[]', steps text NOT NULL DEFAULT '[]',
        times_cooked integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE meal_plans (id integer PRIMARY KEY);
      INSERT INTO categories VALUES (1, '肉类');
    `);
    await applyRecipesWishlistMigration(client);
    database = drizzle(client) as ReturnType<typeof createDatabase>;
  });

  afterEach(async () => { client.close(); await rm(directory, { recursive: true, force: true }); });

  function saveRequest(photoUploadId: string, imageUrl: string) {
    return {
      name: `木樨肉-${photoUploadId}`,
      categoryId: 1,
      imageUrl,
      ingredients: ["鸡蛋"],
      steps: ["炒熟"],
      photoUploadId,
      ownerId: null,
    };
  }

  it("cleanup ownership prevents a later save from referencing the deleting Blob", async () => {
    const now = Date.now();
    await createPhotoUploadReservation(database, {
      id: "upload-cleanup-wins", imageUrl: "https://blob.test/cleanup.jpg", now, expiresAt: now + 60_000,
    });
    expect(await acquirePhotoUploadForCleanup(database, {
      id: "upload-cleanup-wins", imageUrl: "https://blob.test/cleanup.jpg", now: now + 1,
    })).toBe("acquired");

    await expect(saveDishAndMaybeCompleteWish(
      database,
      saveRequest("upload-cleanup-wins", "https://blob.test/cleanup.jpg"),
    )).rejects.toMatchObject({ code: "photo-unavailable" });
    const dishes = await client.execute("SELECT id FROM dishes");
    expect(dishes.rows).toHaveLength(0);
  });

  it("a save claim prevents cleanup from acquiring the same Blob", async () => {
    const now = Date.now();
    await createPhotoUploadReservation(database, {
      id: "upload-save-wins", imageUrl: "https://blob.test/save.jpg", now, expiresAt: now + 60_000,
    });
    await saveDishAndMaybeCompleteWish(database, saveRequest("upload-save-wins", "https://blob.test/save.jpg"));

    expect(await acquirePhotoUploadForCleanup(database, {
      id: "upload-save-wins", imageUrl: "https://blob.test/save.jpg", now: now + 1,
    })).toBe("claimed");
    const row = await client.execute("SELECT status, claimed_dish_id FROM dish_photo_uploads WHERE id='upload-save-wins'");
    expect(row.rows[0]).toMatchObject({ status: "claimed", claimed_dish_id: expect.any(String) });
  });
});
