import { randomUUID } from "node:crypto";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import type { createDatabase } from "../db";
import { dishes, recipes, wishlistCompletions, wishlistItems } from "../db/schema";

export type WishlistDatabase = ReturnType<typeof createDatabase>;

export interface WishlistItemView {
  id: string;
  recipeId: string | null;
  name: string;
  categoryKey: string;
  imageUrl: string | null;
  status: "pending" | "completed";
  addedAt: string;
  completedAt: string | null;
}

export interface WishlistCompletionView {
  id: string;
  wishlistItemId: string;
  recipeId: string | null;
  completedDishId: string | null;
  dishExists: boolean;
  addedAt: string;
  completedAt: string;
  name: string;
  imageUrl: string | null;
}

export type AddWishlistResult =
  | { kind: "created"; item: WishlistItemView }
  | { kind: "duplicate"; itemId: string }
  | { kind: "recipe-not-found" };

function itemOwnerCondition(ownerId: string | null) {
  return ownerId === null ? isNull(wishlistItems.ownerId) : eq(wishlistItems.ownerId, ownerId);
}

function completionOwnerCondition(ownerId: string | null) {
  return ownerId === null ? isNull(wishlistCompletions.ownerId) : eq(wishlistCompletions.ownerId, ownerId);
}

async function findPendingRecipeItemId(
  database: WishlistDatabase,
  recipeId: string,
  ownerId: string | null,
): Promise<string | null> {
  const [item] = await database
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(and(
      eq(wishlistItems.recipeId, recipeId),
      eq(wishlistItems.status, "pending"),
      itemOwnerCondition(ownerId),
    ))
    .limit(1);
  return item?.id ?? null;
}

export async function addWishlistItem(
  database: WishlistDatabase,
  recipeId: string,
  ownerId: string | null,
): Promise<AddWishlistResult> {
  const [recipe] = await database.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1);
  if (!recipe) return { kind: "recipe-not-found" };

  const existingId = await findPendingRecipeItemId(database, recipeId, ownerId);
  if (existingId) return { kind: "duplicate", itemId: existingId };

  const now = new Date().toISOString();
  const id = randomUUID();
  try {
    await database.insert(wishlistItems).values({
      id,
      ownerId,
      recipeId,
      customName: null,
      nameKey: recipe.nameKey,
      categoryKey: recipe.categoryKey,
      status: "pending",
      addedAt: now,
      completedAt: null,
      completedDishId: null,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    const duplicateId = await findPendingRecipeItemId(database, recipeId, ownerId);
    if (duplicateId) return { kind: "duplicate", itemId: duplicateId };
    throw error;
  }

  return {
    kind: "created",
    item: {
      id,
      recipeId,
      name: recipe.name,
      categoryKey: recipe.categoryKey,
      imageUrl: recipe.imageUrl,
      status: "pending",
      addedAt: now,
      completedAt: null,
    },
  };
}

export async function listWishlistItems(
  database: WishlistDatabase,
  ownerId: string | null,
): Promise<{ items: WishlistItemView[]; pendingCount: number; completedCount: number }> {
  const [rows, pendingResult, completedResult] = await database.batch([
    database
      .select({ item: wishlistItems, recipeName: recipes.name, imageUrl: recipes.imageUrl })
      .from(wishlistItems)
      .leftJoin(recipes, eq(recipes.id, wishlistItems.recipeId))
      .where(and(eq(wishlistItems.status, "pending"), itemOwnerCondition(ownerId)))
      .orderBy(desc(wishlistItems.addedAt)),
    database
      .select({ value: count() })
      .from(wishlistItems)
      .where(and(eq(wishlistItems.status, "pending"), itemOwnerCondition(ownerId))),
    database
      .select({ value: count() })
      .from(wishlistCompletions)
      .where(completionOwnerCondition(ownerId)),
  ]);

  return {
    items: rows.map(({ item, recipeName, imageUrl }) => ({
      id: item.id,
      recipeId: item.recipeId,
      name: item.customName ?? recipeName ?? item.nameKey,
      categoryKey: item.categoryKey,
      imageUrl,
      status: item.status,
      addedAt: item.addedAt,
      completedAt: item.completedAt,
    })),
    pendingCount: pendingResult[0]?.value ?? 0,
    completedCount: completedResult[0]?.value ?? 0,
  };
}

export async function removePendingWishlistItem(
  database: WishlistDatabase,
  id: string,
  ownerId: string | null,
): Promise<boolean> {
  const deleted = await database
    .delete(wishlistItems)
    .where(and(
      eq(wishlistItems.id, id),
      eq(wishlistItems.status, "pending"),
      itemOwnerCondition(ownerId),
    ))
    .returning({ id: wishlistItems.id });
  return deleted.length > 0;
}

export async function listWishlistCompletions(
  database: WishlistDatabase,
  ownerId: string | null,
): Promise<WishlistCompletionView[]> {
  const rows = await database
    .select({ completion: wishlistCompletions, linkedDishId: dishes.id })
    .from(wishlistCompletions)
    .leftJoin(dishes, eq(dishes.id, wishlistCompletions.completedDishId))
    .where(completionOwnerCondition(ownerId))
    .orderBy(desc(wishlistCompletions.completedAt));

  return rows.map(({ completion: item, linkedDishId }) => ({
    id: item.id,
    wishlistItemId: item.wishlistItemId,
    recipeId: item.recipeId,
    completedDishId: item.completedDishId,
    dishExists: linkedDishId !== null,
    addedAt: item.addedAtSnapshot,
    completedAt: item.completedAt,
    name: item.nameSnapshot,
    imageUrl: item.imageUrlSnapshot,
  }));
}
