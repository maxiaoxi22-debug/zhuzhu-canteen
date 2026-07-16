import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyRecipesWishlistMigration } from "../../src/db/migrate";
import type { createDatabase } from "../../src/db";
import { saveDishAndMaybeCompleteWish } from "../../src/lib/dish-wishlist-transaction";
import {
  acquirePhotoUploadForCleanup,
  createPhotoUploadReservation,
  finishPhotoUploadCleanup,
  restorePhotoUploadAfterCleanupFailure,
  sweepExpiredPhotoUploads,
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

  it("allows exactly one winner when separate database connections save and clean concurrently", async () => {
    const now = Date.now();
    const imageUrl = "https://blob.test/concurrent.jpg";
    await createPhotoUploadReservation(database, {
      id: "upload-concurrent", imageUrl, now, expiresAt: now + 60_000,
    });
    const secondClient = createClient({ url: `file:${join(directory, "test.db")}` });
    const secondDatabase = drizzle(secondClient) as ReturnType<typeof createDatabase>;
    try {
      const [saveResult, cleanupResult] = await Promise.allSettled([
        saveDishAndMaybeCompleteWish(database, saveRequest("upload-concurrent", imageUrl)),
        acquirePhotoUploadForCleanup(secondDatabase, {
          id: "upload-concurrent", imageUrl, now: now + 1,
        }),
      ]);

      if (saveResult.status === "fulfilled") {
        expect(cleanupResult).toMatchObject({ status: "fulfilled", value: "claimed" });
      } else {
        expect(saveResult.reason).toMatchObject({ code: "photo-unavailable" });
        expect(cleanupResult).toMatchObject({ status: "fulfilled", value: "acquired" });
        const rows = await client.execute("SELECT id FROM dishes WHERE image_url=?", [imageUrl]);
        expect(rows.rows).toHaveLength(0);
      }
    } finally {
      secondClient.close();
    }
  });

  it("keeps an expiry sweep and an already-started save atomic across database connections", async () => {
    const now = Date.now();
    const imageUrl = "https://blob.test/sweep-concurrent.jpg";
    await createPhotoUploadReservation(database, {
      id: "upload-sweep-concurrent", imageUrl, now, expiresAt: now + 60_000,
    });
    const secondClient = createClient({ url: `file:${join(directory, "test.db")}` });
    const secondDatabase = drizzle(secondClient) as ReturnType<typeof createDatabase>;
    const remove = vi.fn(async () => undefined);
    try {
      const [saveResult, sweepResult] = await Promise.allSettled([
        saveDishAndMaybeCompleteWish(database, saveRequest("upload-sweep-concurrent", imageUrl)),
        sweepExpiredPhotoUploads(secondDatabase, remove, { now: now + 120_000 }),
      ]);

      if (saveResult.status === "fulfilled") {
        expect(sweepResult).toMatchObject({
          status: "fulfilled",
          value: { acquired: 0, deleted: 0, failed: 0 },
        });
        expect(remove).not.toHaveBeenCalled();
      } else {
        expect(saveResult.reason).toMatchObject({ code: "photo-unavailable" });
        expect(sweepResult).toMatchObject({
          status: "fulfilled",
          value: { acquired: 1, deleted: 1, failed: 0 },
        });
        expect(remove).toHaveBeenCalledOnce();
        const rows = await client.execute("SELECT id FROM dishes WHERE image_url=?", [imageUrl]);
        expect(rows.rows).toHaveLength(0);
      }
    } finally {
      secondClient.close();
    }
  });

  it("prevents an expired cleanup worker from finalizing or restoring a newer cleanup lease", async () => {
    const now = Date.now();
    const imageUrl = "https://blob.test/fenced-cleanup.jpg";
    await createPhotoUploadReservation(database, {
      id: "upload-fenced-cleanup", imageUrl, now, expiresAt: now + 60_000,
    });
    expect(await acquirePhotoUploadForCleanup(database, {
      id: "upload-fenced-cleanup", imageUrl, now: now + 1,
    })).toBe("acquired");
    await client.execute({
      sql: "UPDATE dish_photo_uploads SET updated_at=? WHERE id=?",
      args: [new Date(now + 120_000).toISOString(), "upload-fenced-cleanup"],
    });

    await expect(finishPhotoUploadCleanup(database, "upload-fenced-cleanup", now + 1)).resolves.toBe(false);
    await expect(restorePhotoUploadAfterCleanupFailure(
      database,
      "upload-fenced-cleanup",
      now + 1,
      now + 2,
    )).resolves.toBe(false);
    const row = await client.execute("SELECT status, updated_at FROM dish_photo_uploads WHERE id='upload-fenced-cleanup'");
    expect(row.rows[0]).toMatchObject({
      status: "deleting",
      updated_at: new Date(now + 120_000).toISOString(),
    });
  });
});
