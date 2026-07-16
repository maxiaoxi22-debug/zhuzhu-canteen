import { createClient } from "@libsql/client";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportDatabaseSnapshot } from "../../scripts/db/export-backup";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

describe("recipes and wishlist migration", () => {
  const clients: ReturnType<typeof createClient>[] = [];
  afterEach(async () => Promise.all(clients.map((client) => client.close())));

  it("is additive and idempotent", async () => {
    const client = createClient({ url: ":memory:" });
    clients.push(client);
    await client.executeMultiple(`
      CREATE TABLE dishes (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE meal_plans (id integer PRIMARY KEY AUTOINCREMENT, date text NOT NULL, meal_type text NOT NULL);
    `);
    await applyRecipesWishlistMigration(client);
    await applyRecipesWishlistMigration(client);
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      "recipes", "recipe_ingredients", "recipe_steps", "recipe_aliases", "wishlist_items", "wishlist_completions",
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
    ]));
    const wishlistDdl = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'wishlist_items'",
    );
    expect(wishlistDdl.rows[0]?.sql).toContain("CHECK(status IN ('pending','completed'))");
  });

  it("allows importing the isolated database factory without production environment variables", async () => {
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");

    const databaseModule = await import("../../src/db/index");

    expect(databaseModule.createDatabase(":memory:")).toBeDefined();
    vi.unstubAllEnvs();
  });
});

describe("database snapshots", () => {
  const clients: ReturnType<typeof createClient>[] = [];
  afterEach(async () => Promise.all(clients.map((client) => client.close())));

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
