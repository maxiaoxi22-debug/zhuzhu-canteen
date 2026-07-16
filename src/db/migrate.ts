import type { Client } from "@libsql/client";

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

async function hasColumn(client: Client, table: string, column: string): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

export async function applyRecipesWishlistMigration(client: Client): Promise<void> {
  await client.executeMultiple(MIGRATION_SQL);

  for (const { table, column, definition } of LEGACY_COLUMNS) {
    if (!(await hasColumn(client, table, column))) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}
