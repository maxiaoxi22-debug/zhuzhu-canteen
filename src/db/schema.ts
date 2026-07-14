import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
  timesCooked: integer("times_cooked").notNull().default(0),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export const mealPlans = sqliteTable("meal_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  mealType: text("meal_type").notNull(),
  dishId: text("dish_id").references(() => dishes.id),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
