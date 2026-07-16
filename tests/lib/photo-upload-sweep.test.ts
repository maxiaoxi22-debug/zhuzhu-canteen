import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { createDatabase } from "../../src/db";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";
import * as photoReservations from "../../src/lib/photo-upload-reservation";

type Database = ReturnType<typeof createDatabase>;
type Sweep = (
  database: Database,
  remove: (url: string) => Promise<void>,
  options: { now: number; batchSize?: number; staleDeletingMs?: number },
) => Promise<{ acquired: number; deleted: number; failed: number }>;
type CreateCronHandler = (options: {
  secret?: string;
  sweep: () => Promise<{ acquired: number; deleted: number; failed: number }>;
}) => (request: Request) => Promise<Response>;

const sweep = (photoReservations as typeof photoReservations & {
  sweepExpiredPhotoUploads?: Sweep;
}).sweepExpiredPhotoUploads;
const createCronHandler = (photoReservations as typeof photoReservations & {
  createPhotoUploadSweepCronHandler?: CreateCronHandler;
}).createPhotoUploadSweepCronHandler;

describe("expired dish photo upload sweep", () => {
  let client: Client;
  let database: Database;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "photo-sweep-"));
    client = createClient({ url: `file:${join(directory, "test.db")}` });
    await client.executeMultiple(`
      CREATE TABLE dishes (
        id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE, category_id integer,
        image_url text, ingredients text NOT NULL DEFAULT '[]', steps text NOT NULL DEFAULT '[]',
        times_cooked integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE meal_plans (id integer PRIMARY KEY);
    `);
    await applyRecipesWishlistMigration(client);
    database = drizzle(client) as Database;
  });

  afterEach(async () => { client.close(); await rm(directory, { recursive: true, force: true }); });

  async function insertUpload(input: {
    id: string;
    status: "temp" | "deleting" | "claimed";
    expiresAt: number;
    updatedAt: number;
  }) {
    await client.execute({
      sql: `INSERT INTO dish_photo_uploads
        (id, image_url, status, claimed_dish_id, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      args: [
        input.id,
        `https://example.public.blob.vercel-storage.com/zhuzhu-canteen/${input.id}.jpg`,
        input.status,
        input.expiresAt,
        new Date(input.updatedAt).toISOString(),
        new Date(input.updatedAt).toISOString(),
      ],
    });
  }

  it("atomically acquires only expired temp and stale deleting reservations", async () => {
    expect(sweep).toBeTypeOf("function");
    if (!sweep) return;
    const now = Date.parse("2026-07-17T00:00:00.000Z");
    await insertUpload({ id: "expired", status: "temp", expiresAt: now - 1, updatedAt: now - 1 });
    await insertUpload({ id: "fresh", status: "temp", expiresAt: now + 60_000, updatedAt: now });
    await insertUpload({ id: "stale", status: "deleting", expiresAt: now - 60_000, updatedAt: now - 31 * 60_000 });
    await insertUpload({ id: "active", status: "deleting", expiresAt: now - 60_000, updatedAt: now - 1_000 });

    const remove = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
    await expect(sweep(database, remove, { now, staleDeletingMs: 30 * 60_000 })).resolves.toEqual({
      acquired: 2, deleted: 2, failed: 0,
    });
    expect(remove.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      expect.stringContaining("expired.jpg"),
      expect.stringContaining("stale.jpg"),
    ]));
    const rows = await client.execute("SELECT id, status FROM dish_photo_uploads ORDER BY id");
    expect(rows.rows).toEqual([
      expect.objectContaining({ id: "active", status: "deleting" }),
      expect.objectContaining({ id: "fresh", status: "temp" }),
    ]);
  });

  it("keeps a failed deletion fail-closed and retries it after the stale threshold", async () => {
    expect(sweep).toBeTypeOf("function");
    if (!sweep) return;
    const now = Date.parse("2026-07-17T00:00:00.000Z");
    await insertUpload({ id: "offline", status: "temp", expiresAt: now - 1, updatedAt: now - 1 });
    const remove = vi.fn()
      .mockRejectedValueOnce(new Error("network offline"))
      .mockResolvedValue(undefined);

    await expect(sweep(database, remove, { now, staleDeletingMs: 30_000 })).resolves.toEqual({
      acquired: 1, deleted: 0, failed: 1,
    });
    const afterFailure = await client.execute("SELECT status, updated_at FROM dish_photo_uploads WHERE id='offline'");
    expect(afterFailure.rows[0]).toMatchObject({ status: "deleting", updated_at: new Date(now).toISOString() });

    await expect(sweep(database, remove, { now: now + 30_001, staleDeletingMs: 30_000 })).resolves.toEqual({
      acquired: 1, deleted: 1, failed: 0,
    });
    await expect(sweep(database, remove, { now: now + 60_002, staleDeletingMs: 30_000 })).resolves.toEqual({
      acquired: 0, deleted: 0, failed: 0,
    });
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("never deletes a claimed reservation", async () => {
    expect(sweep).toBeTypeOf("function");
    if (!sweep) return;
    const now = Date.parse("2026-07-17T00:00:00.000Z");
    await insertUpload({ id: "claimed", status: "claimed", expiresAt: now - 60_000, updatedAt: now - 60_000 });
    const remove = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);

    await expect(sweep(database, remove, { now })).resolves.toEqual({ acquired: 0, deleted: 0, failed: 0 });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("photo upload sweep cron authorization", () => {
  it("fails closed when CRON_SECRET is not configured", async () => {
    expect(createCronHandler).toBeTypeOf("function");
    if (!createCronHandler) return;
    const handler = createCronHandler({ secret: "", sweep: vi.fn() });
    const response = await handler(new Request("http://local.test/api/cron/photo-uploads"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "定时清理服务未配置" });
  });

  it("returns a generic 401 and does not run for a missing or incorrect bearer token", async () => {
    expect(createCronHandler).toBeTypeOf("function");
    if (!createCronHandler) return;
    const runSweep = vi.fn();
    const handler = createCronHandler({ secret: "cron-secret", sweep: runSweep });

    for (const authorization of [undefined, "Bearer wrong-secret"]) {
      const response = await handler(new Request("http://local.test/api/cron/photo-uploads", {
        headers: authorization ? { authorization } : undefined,
      }));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "未授权" });
    }
    expect(runSweep).not.toHaveBeenCalled();
  });

  it("runs once and returns only counts for the configured bearer token", async () => {
    expect(createCronHandler).toBeTypeOf("function");
    if (!createCronHandler) return;
    const runSweep = vi.fn(async () => ({ acquired: 3, deleted: 2, failed: 1 }));
    const handler = createCronHandler({ secret: "cron-secret", sweep: runSweep });
    const response = await handler(new Request("http://local.test/api/cron/photo-uploads", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ acquired: 3, deleted: 2, failed: 1 });
    expect(runSweep).toHaveBeenCalledTimes(1);
  });
});
