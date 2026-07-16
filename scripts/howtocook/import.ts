import { createClient, type Client, type Transaction } from "@libsql/client";
import { config } from "dotenv";
import { getTableName } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  recipeAliases,
  recipeIngredients,
  recipes,
  recipeSteps,
} from "../../src/db/schema";
import type { StagedRecipe } from "./parse";

config({ path: ".env.local", quiet: true });

export interface ImportSummary {
  inserts: number;
  updates: number;
  unchanged: number;
}

type WriteExecutor = Pick<Transaction, "execute">;

async function existingHashes(executor: Pick<Transaction, "execute">): Promise<Map<string, string>> {
  const result = await executor.execute(`SELECT id, content_hash FROM ${getTableName(recipes)}`);
  return new Map(result.rows.map((row) => [String(row.id), String(row.content_hash)]));
}

function summarize(stagedRecipes: StagedRecipe[], hashes: ReadonlyMap<string, string>): ImportSummary {
  const summary: ImportSummary = { inserts: 0, updates: 0, unchanged: 0 };
  for (const recipe of stagedRecipes) {
    const hash = hashes.get(recipe.id);
    if (hash === undefined) summary.inserts += 1;
    else if (hash === recipe.contentHash) summary.unchanged += 1;
    else summary.updates += 1;
  }
  return summary;
}

async function replaceRecipe(executor: WriteExecutor, recipe: StagedRecipe, exists: boolean): Promise<void> {
  const now = new Date().toISOString();
  const values = [
    recipe.id, recipe.name, recipe.nameKey, recipe.categoryKey, recipe.description,
    recipe.servings, recipe.estimatedTimeMinutes, recipe.sourceName, recipe.sourceUrl,
    recipe.sourceLicense, recipe.sourcePath, recipe.sourceRevision, recipe.contentHash,
    recipe.imageUrl, now, now,
  ];

  if (exists) {
    await executor.execute({
      sql: `UPDATE recipes SET name=?, name_key=?, category_key=?, description=?, servings=?, estimated_time_minutes=?, source_name=?, source_url=?, source_license=?, source_path=?, source_revision=?, content_hash=?, image_url=?, updated_at=? WHERE id=?`,
      args: [...values.slice(1, 14), now, recipe.id],
    });
    await executor.execute({ sql: `DELETE FROM ${getTableName(recipeIngredients)} WHERE recipe_id=?`, args: [recipe.id] });
    await executor.execute({ sql: `DELETE FROM ${getTableName(recipeSteps)} WHERE recipe_id=?`, args: [recipe.id] });
    await executor.execute({ sql: `DELETE FROM ${getTableName(recipeAliases)} WHERE recipe_id=?`, args: [recipe.id] });
  } else {
    await executor.execute({
      sql: "INSERT INTO recipes (id,name,name_key,category_key,description,servings,estimated_time_minutes,source_name,source_url,source_license,source_path,source_revision,content_hash,image_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: values,
    });
  }

  for (const [sortOrder, ingredient] of recipe.ingredients.entries()) {
    await executor.execute({
      sql: "INSERT INTO recipe_ingredients (recipe_id,sort_order,ingredient_name,amount_value,amount_unit,amount_text,optional,note) VALUES (?,?,?,?,?,?,?,?)",
      args: [recipe.id, sortOrder, ingredient.ingredientName, ingredient.amountValue, ingredient.amountUnit, ingredient.amountText, ingredient.optional ? 1 : 0, ingredient.note],
    });
  }
  for (const [sortOrder, step] of recipe.steps.entries()) {
    await executor.execute({
      sql: "INSERT INTO recipe_steps (recipe_id,sort_order,text,section_name) VALUES (?,?,?,?)",
      args: [recipe.id, sortOrder, step.text, step.sectionName],
    });
  }
  for (const alias of recipe.aliases) {
    await executor.execute({
      sql: "INSERT INTO recipe_aliases (recipe_id,alias,alias_key) VALUES (?,?,?)",
      args: [recipe.id, alias.alias, alias.aliasKey],
    });
  }
}

export async function importStagedRecipes(
  client: Client,
  stagedRecipes: StagedRecipe[],
  options: { apply: boolean },
): Promise<ImportSummary> {
  const writeChangedRecipes = async (
    executor: WriteExecutor,
    hashes: ReadonlyMap<string, string>,
  ): Promise<void> => {
    for (const recipe of stagedRecipes) {
      const oldHash = hashes.get(recipe.id);
      if (oldHash === recipe.contentHash) continue;
      await replaceRecipe(executor, recipe, oldHash !== undefined);
    }
  };

  if (!options.apply) {
    return summarize(stagedRecipes, await existingHashes(client));
  }

  if (client.protocol === "file") {
    await client.execute("BEGIN IMMEDIATE");
    try {
      const hashes = await existingHashes(client);
      const summary = summarize(stagedRecipes, hashes);
      await writeChangedRecipes(client, hashes);
      await client.execute("COMMIT");
      return summary;
    } catch (error) {
      await client.execute("ROLLBACK");
      throw error;
    }
  }

  const transaction = await client.transaction("write");
  try {
    const hashes = await existingHashes(transaction);
    const summary = summarize(stagedRecipes, hashes);
    await writeChangedRecipes(transaction, hashes);
    await transaction.commit();
    return summary;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export type ImportMode = "apply" | "dry-run" | "offline-dry-run";

export function resolveImportMode(arguments_: string[]): ImportMode {
  const selected = (["apply", "dry-run", "offline-dry-run"] as const)
    .filter((mode) => arguments_.includes(`--${mode}`));
  if (selected.length !== 1) {
    throw new Error("Choose exactly one mode: --dry-run, --offline-dry-run, or --apply");
  }
  return selected[0];
}

async function main(): Promise<void> {
  const mode = resolveImportMode(process.argv.slice(2));
  const stagedRecipes = JSON.parse(await readFile(resolve("data/howtocook/recipes.json"), "utf8")) as StagedRecipe[];
  const explicitUrl = readArgument("--database-url");
  if (mode === "offline-dry-run") {
    console.log(`Dry run (offline empty target): inserts=${stagedRecipes.length}, updates=0, unchanged=0.`);
    console.log("No database connection was opened and no data was written.");
    return;
  }

  const url = explicitUrl ?? process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error(`${mode === "apply" ? "--apply" : "--dry-run"} requires --database-url or TURSO_DATABASE_URL`);
  const client = createClient({ url, ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}) });
  try {
    const summary = await importStagedRecipes(client, stagedRecipes, { apply: mode === "apply" });
    console.log(`${mode === "apply" ? "Applied" : "Dry run"}: inserts=${summary.inserts}, updates=${summary.updates}, unchanged=${summary.unchanged}.`);
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
