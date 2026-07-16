import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { consumeApiRateLimit } from "../../src/lib/api-rate-limit";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("database-backed API rate limit", () => {
  let client: Client;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "rate-limit-"));
    client = createClient({ url: `file:${join(directory, "test.db")}` });
    await client.executeMultiple(`
      CREATE TABLE dishes (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE meal_plans (id integer PRIMARY KEY);
    `);
    await applyRecipesWishlistMigration(client);
  });

  afterEach(async () => { client.close(); await rm(directory, { recursive: true, force: true }); });

  it("shares counters through the database and removes expired windows", async () => {
    const database = drizzle(client);
    expect(await consumeApiRateLimit(database, "recognize:1.2.3.4", { limit: 2, windowMs: 1_000, now: 1_000 })).toBe(true);
    expect(await consumeApiRateLimit(database, "recognize:1.2.3.4", { limit: 2, windowMs: 1_000, now: 1_100 })).toBe(true);
    expect(await consumeApiRateLimit(database, "recognize:1.2.3.4", { limit: 2, windowMs: 1_000, now: 1_200 })).toBe(false);
    expect(await consumeApiRateLimit(database, "upload:5.6.7.8", { limit: 2, windowMs: 1_000, now: 2_100 })).toBe(true);

    const rows = await client.execute("SELECT key FROM api_rate_limits ORDER BY key");
    expect(rows.rows.map((row) => row.key)).toEqual(["upload:5.6.7.8"]);
  });
});
