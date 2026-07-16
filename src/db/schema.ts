import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const dishes = sqliteTable("dishes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").unique(),
  categoryId: integer("category_id").references(() => categories.id),
  imageUrl: text("image_url"),
  ingredients: text("ingredients").notNull().default("[]"),
  steps: text("steps").notNull().default("[]"),
  recipeId: text("recipe_id").references((): AnySQLiteColumn => recipes.id),
  wishlistItemId: text("wishlist_item_id").references((): AnySQLiteColumn => wishlistItems.id),
  ownerId: text("owner_id"),
  timesCooked: integer("times_cooked").notNull().default(0),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export const mealPlans = sqliteTable("meal_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  mealType: text("meal_type").notNull(),
  dishId: text("dish_id").references(() => dishes.id),
  recipeId: text("recipe_id").references((): AnySQLiteColumn => recipes.id),
  wishlistItemId: text("wishlist_item_id").references((): AnySQLiteColumn => wishlistItems.id),
  sourceType: text("source_type"),
  ownerId: text("owner_id"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  categoryKey: text("category_key").notNull(),
  description: text("description"),
  servings: integer("servings"),
  estimatedTimeMinutes: integer("estimated_time_minutes"),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceLicense: text("source_license").notNull(),
  sourcePath: text("source_path").notNull(),
  sourceRevision: text("source_revision").notNull(),
  contentHash: text("content_hash").notNull(),
  imageUrl: text("image_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("recipes_source_path_revision_uq").on(table.sourcePath, table.sourceRevision),
  index("recipes_name_key_idx").on(table.nameKey),
]);

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  amountValue: real("amount_value"),
  amountUnit: text("amount_unit"),
  amountText: text("amount_text").notNull(),
  optional: integer("optional").notNull().default(0),
  note: text("note"),
});

export const recipeSteps = sqliteTable("recipe_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
  text: text("text").notNull(),
  sectionName: text("section_name"),
});

export const recipeAliases = sqliteTable("recipe_aliases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  aliasKey: text("alias_key").notNull(),
}, (table) => [
  uniqueIndex("recipe_alias_recipe_uq").on(table.recipeId, table.aliasKey),
  index("recipe_alias_key_idx").on(table.aliasKey),
]);

export const wishlistItems = sqliteTable("wishlist_items", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id"),
  recipeId: text("recipe_id").references(() => recipes.id),
  customName: text("custom_name"),
  nameKey: text("name_key").notNull(),
  categoryKey: text("category_key").notNull(),
  status: text("status", { enum: ["pending", "completed"] }).notNull(),
  addedAt: text("added_at").notNull(),
  completedAt: text("completed_at"),
  completedDishId: text("completed_dish_id").references(() => dishes.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("wishlist_items_status_check", sql`${table.status} IN ('pending','completed')`),
  uniqueIndex("wishlist_pending_recipe_uq")
    .on(sql`ifnull(${table.ownerId}, '__legacy__')`, table.recipeId)
    .where(sql`${table.status} = 'pending' AND ${table.recipeId} IS NOT NULL`),
]);

export const wishlistCompletions = sqliteTable("wishlist_completions", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id"),
  wishlistItemId: text("wishlist_item_id").notNull().references(() => wishlistItems.id),
  recipeId: text("recipe_id").references(() => recipes.id),
  completedDishId: text("completed_dish_id").references(() => dishes.id, { onDelete: "set null" }),
  addedAtSnapshot: text("added_at_snapshot").notNull(),
  completedAt: text("completed_at").notNull(),
  nameSnapshot: text("name_snapshot").notNull(),
  imageUrlSnapshot: text("image_url_snapshot"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("wishlist_completion_time_idx").on(sql`${table.completedAt} DESC`),
]);

export const dishPhotoUploads = sqliteTable("dish_photo_uploads", {
  id: text("id").primaryKey(),
  imageUrl: text("image_url").notNull().unique(),
  status: text("status", { enum: ["temp", "deleting", "claimed"] }).notNull(),
  claimedDishId: text("claimed_dish_id").references(() => dishes.id, { onDelete: "set null" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("dish_photo_uploads_status_check", sql`${table.status} IN ('temp','deleting','claimed')`),
  index("dish_photo_uploads_status_expiry_idx").on(table.status, table.expiresAt),
]);

export const apiRateLimits = sqliteTable("api_rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  index("api_rate_limits_expiry_idx").on(table.expiresAt),
]);
