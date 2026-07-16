import { createClient } from "@libsql/client";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportDatabaseSnapshot } from "../../scripts/db/export-backup";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("recipes and wishlist migration", () => {
  const clients: ReturnType<typeof createClient>[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    vi.unstubAllEnvs();
  });

  it("is additive and idempotent", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);
    await client.executeMultiple(`
      CREATE TABLE dishes (
        id text PRIMARY KEY, name text NOT NULL, name_key text UNIQUE, category_id integer,
        image_url text, ingredients text NOT NULL DEFAULT '[]', steps text NOT NULL DEFAULT '[]',
        times_cooked integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL
      );
      CREATE TABLE meal_plans (
        id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, meal_type text NOT NULL,
        dish_id text REFERENCES dishes(id), notes text, created_at text NOT NULL
      );
      INSERT INTO dishes VALUES (
        'dish-1', '番茄炒蛋', '番茄炒蛋', 3, '/tomato.jpg', '["番茄","鸡蛋"]', '["炒熟"]', 4,
        '2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z'
      );
      INSERT INTO meal_plans (date, meal_type, dish_id, notes, created_at) VALUES (
        '2026-07-17', 'dinner', 'dish-1', '少盐', '2026-07-16T00:00:00.000Z'
      );
    `);
    const originalDish = await client.execute("SELECT * FROM dishes");
    const originalPlan = await client.execute("SELECT * FROM meal_plans");

    await applyRecipesWishlistMigration(client);
    await applyRecipesWishlistMigration(client);

    const migratedDish = await client.execute("SELECT * FROM dishes");
    const migratedPlan = await client.execute("SELECT * FROM meal_plans");
    expect(Object.fromEntries(
      Object.keys(originalDish.rows[0]!).map((column) => [column, migratedDish.rows[0]![column]]),
    )).toEqual(originalDish.rows[0]);
    expect(Object.fromEntries(
      Object.keys(originalPlan.rows[0]!).map((column) => [column, migratedPlan.rows[0]![column]]),
    )).toEqual(originalPlan.rows[0]);
    expect(migratedDish.rows[0]).toMatchObject({ recipe_id: null, wishlist_item_id: null, owner_id: null });
    expect(migratedPlan.rows[0]).toMatchObject({
      recipe_id: null, wishlist_item_id: null, source_type: null, owner_id: null,
    });
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      "recipes", "recipe_ingredients", "recipe_steps", "recipe_aliases", "wishlist_items", "wishlist_completions",
      "dish_photo_uploads", "api_rate_limits",
    ]));
    const dishColumns = await client.execute("PRAGMA table_info(dishes)");
    expect(dishColumns.rows.map((row) => row.name)).toEqual(expect.arrayContaining(["recipe_id", "wishlist_item_id", "owner_id"]));
    const planColumns = await client.execute("PRAGMA table_info(meal_plans)");
    expect(planColumns.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      "recipe_id", "wishlist_item_id", "source_type", "owner_id",
    ]));
    const planForeignKeys = await client.execute("PRAGMA foreign_key_list(meal_plans)");
    expect(planForeignKeys.rows.map((row) => ({ from: row.from, table: row.table }))).toEqual(expect.arrayContaining([
      { from: "recipe_id", table: "recipes" },
      { from: "wishlist_item_id", table: "wishlist_items" },
    ]));
    const indexes = await client.execute("SELECT name FROM sqlite_master WHERE type = 'index'");
    expect(indexes.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      "recipes_source_path_revision_uq",
      "recipes_name_key_idx",
      "recipe_alias_recipe_uq",
      "recipe_alias_key_idx",
      "wishlist_pending_recipe_uq",
      "wishlist_completion_time_idx",
      "dish_photo_uploads_status_expiry_idx",
      "api_rate_limits_expiry_idx",
    ]));
    const wishlistDdl = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'wishlist_items'",
    );
    expect(wishlistDdl.rows[0]?.sql).toContain("CHECK(status IN ('pending','completed'))");
    for (const table of [
      "recipes", "recipe_ingredients", "recipe_steps", "recipe_aliases", "wishlist_items", "wishlist_completions",
      "dish_photo_uploads", "api_rate_limits",
    ]) {
      const rows = await client.execute(`SELECT * FROM ${table}`);
      expect(rows.rows).toHaveLength(0);
    }
  });

  it("rolls back every schema change when a legacy ALTER fails", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);
    await client.executeMultiple(`
      CREATE TABLE dishes (id text PRIMARY KEY, name text NOT NULL);
      CREATE VIEW meal_plans AS SELECT '2026-07-17' AS date, 'dinner' AS meal_type;
    `);

    await expect(applyRecipesWishlistMigration(client)).rejects.toThrow();

    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
    expect(tables.rows.map((row) => row.name)).not.toContain("recipes");
    const dishColumns = await client.execute("PRAGMA table_info(dishes)");
    expect(dishColumns.rows.map((row) => row.name)).toEqual(["id", "name"]);
  });

  it("allows importing the isolated database factory without production environment variables", async () => {
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");

    try {
      const databaseModule = await import("../../src/db/index");
      const database = databaseModule.createDatabase(":memory:");
      clients.push(database.$client);
      const result = await database.$client.execute("SELECT 42 AS answer");
      expect(result.rows[0]?.answer).toBe(42);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("database snapshots", () => {
  const clients: ReturnType<typeof createClient>[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it("performs every schema and row read in one read transaction", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);
    await client.executeMultiple(`
      CREATE TABLE example (id integer PRIMARY KEY, name text NOT NULL);
      INSERT INTO example VALUES (1, 'first');
    `);
    let transactionMode: string | undefined;
    const guardedClient = new Proxy(client, {
      get(target, property, receiver) {
        if (property === "protocol") {
          return "ws";
        }
        if (property === "execute") {
          return () => Promise.reject(new Error("snapshot read escaped its transaction"));
        }
        if (property === "transaction") {
          return async (mode?: string) => {
            transactionMode = mode;
            return target.transaction(mode as "read");
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const outputDirectory = await mkdtemp(join(tmpdir(), "zhuzhu-backup-transaction-"));

    await exportDatabaseSnapshot(guardedClient, join(outputDirectory, "snapshot.json"));

    expect(transactionMode).toBe("read");
  });

  it("exports user table DDL and deterministically ordered rows without overwriting", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);
    await client.executeMultiple(`
      CREATE TABLE example (id integer PRIMARY KEY, name text NOT NULL);
      INSERT INTO example (id, name) VALUES (2, 'second'), (1, 'first');
      CREATE TABLE files (id integer PRIMARY KEY, payload blob, note text);
      CREATE TABLE _libsql_internal (id integer PRIMARY KEY);
    `);
    await client.execute({
      sql: "INSERT INTO files (id, payload, note) VALUES (?, ?, ?)",
      args: [1, new Uint8Array([1, 2, 255]), null],
    });
    const outputDirectory = await mkdtemp(join(tmpdir(), "zhuzhu-backup-"));
    const outputPath = join(outputDirectory, "snapshot.json");

    const snapshot = await exportDatabaseSnapshot(client, outputPath);
    const written = JSON.parse(await readFile(outputPath, "utf8"));

    expect(snapshot.tables).toEqual([
      {
        name: "example",
        sql: "CREATE TABLE example (id integer PRIMARY KEY, name text NOT NULL)",
        rows: [{ id: 1, name: "first" }, { id: 2, name: "second" }],
      },
      {
        name: "files",
        sql: "CREATE TABLE files (id integer PRIMARY KEY, payload blob, note text)",
        rows: [{
          id: 1,
          payload: { $type: "blob", base64: "AQL/" },
          note: null,
        }],
      },
    ]);
    expect(written).toEqual(snapshot);
    await expect(exportDatabaseSnapshot(client, outputPath)).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("preserves the full SQLite 64-bit integer range", async () => {
    const client = createClient({ url: ":memory:", intMode: "bigint" });
    clients.push(client);
    await client.executeMultiple(`
      CREATE TABLE large_integers (value integer PRIMARY KEY);
      INSERT INTO large_integers (value) VALUES (-9223372036854775808), (9223372036854775807);
    `);
    const outputDirectory = await mkdtemp(join(tmpdir(), "zhuzhu-backup-int64-"));
    const outputPath = join(outputDirectory, "snapshot.json");

    const snapshot = await exportDatabaseSnapshot(client, outputPath);

    expect(snapshot.tables[0]?.rows).toEqual([
      { value: { $type: "bigint", value: "-9223372036854775808" } },
      { value: { $type: "bigint", value: "9223372036854775807" } },
    ]);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(snapshot);
  });
});
