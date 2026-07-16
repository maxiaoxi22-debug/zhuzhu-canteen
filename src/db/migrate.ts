import type { Client, Transaction } from "@libsql/client";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS recipes (
  id text PRIMARY KEY, name text NOT NULL, name_key text NOT NULL, category_key text NOT NULL,
  description text, servings integer, estimated_time_minutes integer,
  source_name text NOT NULL, source_url text NOT NULL, source_license text NOT NULL,
  source_path text NOT NULL, source_revision text NOT NULL, content_hash text NOT NULL,
  image_url text, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_path_revision_uq ON recipes(source_path, source_revision);
CREATE INDEX IF NOT EXISTS recipes_name_key_idx ON recipes(name_key);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id integer PRIMARY KEY AUTOINCREMENT, recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL, ingredient_name text NOT NULL, amount_value real,
  amount_unit text, amount_text text NOT NULL, optional integer NOT NULL DEFAULT 0, note text
);
CREATE TABLE IF NOT EXISTS recipe_steps (
  id integer PRIMARY KEY AUTOINCREMENT, recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order integer NOT NULL, text text NOT NULL, section_name text
);
CREATE TABLE IF NOT EXISTS recipe_aliases (
  id integer PRIMARY KEY AUTOINCREMENT, recipe_id text NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  alias text NOT NULL, alias_key text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS recipe_alias_recipe_uq ON recipe_aliases(recipe_id, alias_key);
CREATE INDEX IF NOT EXISTS recipe_alias_key_idx ON recipe_aliases(alias_key);
CREATE TABLE IF NOT EXISTS wishlist_items (
  id text PRIMARY KEY, owner_id text, recipe_id text REFERENCES recipes(id), custom_name text,
  name_key text NOT NULL, category_key text NOT NULL, status text NOT NULL CHECK(status IN ('pending','completed')),
  added_at text NOT NULL, completed_at text, completed_dish_id text REFERENCES dishes(id) ON DELETE SET NULL,
  created_at text NOT NULL, updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_pending_recipe_uq
  ON wishlist_items(ifnull(owner_id, '__legacy__'), recipe_id) WHERE status='pending' AND recipe_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS wishlist_completions (
  id text PRIMARY KEY, owner_id text, wishlist_item_id text NOT NULL REFERENCES wishlist_items(id),
  recipe_id text REFERENCES recipes(id), completed_dish_id text REFERENCES dishes(id) ON DELETE SET NULL,
  added_at_snapshot text NOT NULL, completed_at text NOT NULL,
  name_snapshot text NOT NULL, image_url_snapshot text, created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS wishlist_completion_time_idx ON wishlist_completions(completed_at DESC);
CREATE TABLE IF NOT EXISTS dish_photo_uploads (
  id text PRIMARY KEY, image_url text NOT NULL UNIQUE,
  status text NOT NULL CHECK(status IN ('temp','deleting','claimed')),
  claimed_dish_id text REFERENCES dishes(id) ON DELETE SET NULL,
  expires_at integer NOT NULL, created_at text NOT NULL, updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS dish_photo_uploads_status_expiry_idx
  ON dish_photo_uploads(status, expires_at);
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key text PRIMARY KEY, window_started_at integer NOT NULL,
  count integer NOT NULL, expires_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS api_rate_limits_expiry_idx ON api_rate_limits(expires_at);
`;

const LEGACY_COLUMNS = [
  { table: "dishes", column: "recipe_id", definition: "text REFERENCES recipes(id)" },
  { table: "dishes", column: "wishlist_item_id", definition: "text REFERENCES wishlist_items(id)" },
  { table: "dishes", column: "owner_id", definition: "text" },
  { table: "meal_plans", column: "recipe_id", definition: "text REFERENCES recipes(id)" },
  { table: "meal_plans", column: "wishlist_item_id", definition: "text REFERENCES wishlist_items(id)" },
  { table: "meal_plans", column: "source_type", definition: "text" },
  { table: "meal_plans", column: "owner_id", definition: "text" },
] as const;

async function hasColumn(executor: Pick<Transaction, "execute">, table: string, column: string): Promise<boolean> {
  const result = await executor.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

type MigrationExecutor = Pick<Transaction, "execute" | "executeMultiple">;

async function applyMigrationStatements(executor: MigrationExecutor): Promise<void> {
  await executor.executeMultiple(MIGRATION_SQL);

  for (const { table, column, definition } of LEGACY_COLUMNS) {
    if (!(await hasColumn(executor, table, column))) {
      await executor.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

async function executeMultipleLocally(client: Client, sql: string): Promise<void> {
  for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await client.execute(statement);
  }
}

export async function applyRecipesWishlistMigration(client: Client): Promise<void> {
  if (client.protocol === "file") {
    await client.execute("BEGIN IMMEDIATE");
    try {
      await applyMigrationStatements({
        execute: client.execute.bind(client),
        executeMultiple: (sql) => executeMultipleLocally(client, sql),
      });
      await client.execute("COMMIT");
    } catch (error) {
      await client.execute("ROLLBACK");
      throw error;
    }
    return;
  }

  const transaction = await client.transaction("write");
  try {
    await applyMigrationStatements(transaction);
    await transaction.commit();
  } finally {
    transaction.close();
  }
}
