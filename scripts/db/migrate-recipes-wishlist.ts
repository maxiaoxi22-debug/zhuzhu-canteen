import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { pathToFileURL } from "node:url";
import { applyRecipesWishlistMigration } from "../../src/db/migrate";

config({ path: ".env.local" });

const PLANNED_TABLES = [
  "recipes",
  "recipe_ingredients",
  "recipe_steps",
  "recipe_aliases",
  "wishlist_items",
  "wishlist_completions",
  "dish_photo_uploads",
  "api_rate_limits",
];

const PLANNED_COLUMNS = [
  "dishes.recipe_id",
  "dishes.wishlist_item_id",
  "dishes.owner_id",
  "meal_plans.recipe_id",
  "meal_plans.wishlist_item_id",
  "meal_plans.source_type",
  "meal_plans.owner_id",
];

function hostnameFor(url: string): string {
  try {
    return new URL(url).hostname || "local database";
  } catch {
    return "local database";
  }
}

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required");
  }

  console.log(`Target hostname: ${hostnameFor(url)}`);
  console.log(`Planned tables: ${PLANNED_TABLES.join(", ")}`);
  console.log(`Planned columns: ${PLANNED_COLUMNS.join(", ")}`);

  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Re-run with --apply to apply the migration.");
    return;
  }

  const client = createClient({
    url,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  });
  try {
    await applyRecipesWishlistMigration(client);
    console.log("Migration applied.");
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Migration failed");
    process.exitCode = 1;
  });
}
