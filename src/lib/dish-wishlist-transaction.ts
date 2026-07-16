import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { createDatabase } from "../db";
import { dishes, recipes, wishlistCompletions, wishlistItems } from "../db/schema";
import { getCategoryMeta } from "./categories";
import { findDishNameMatch, normalizeDishName } from "./dish-name-match";
import { claimPhotoUpload } from "./photo-upload-reservation";

export type DishWishlistDatabase = ReturnType<typeof createDatabase>;

export interface DishSaveRequest {
  name: string;
  categoryId: number | null;
  imageUrl: string | null;
  ingredients: string[];
  steps: string[];
  recipeId?: string;
  wishlistItemId?: string;
  completeWishlist?: boolean;
  ownerId: string | null;
  photoUploadId?: string;
}

export interface CompletionCandidate {
  id: string;
  recipeId: string | null;
  name: string;
  imageUrl: string | null;
}

export interface DishSaveResult {
  id: string;
  wishlistCompletion?: { id: string; name: string; imageUrl: string | null };
}

export class DishTransactionError extends Error {
  constructor(
    public code: "duplicate" | "recipe-not-found" | "photo-unavailable",
    message: string,
    public match?: ReturnType<typeof findDishNameMatch>,
  ) {
    super(message);
  }
}

type CompletionLookupDatabase = Pick<DishWishlistDatabase, "select">;

function ownerCondition(ownerId: string | null) {
  return ownerId === null ? isNull(wishlistItems.ownerId) : eq(wishlistItems.ownerId, ownerId);
}

function categoryKey(categoryId: number | null): string {
  return getCategoryMeta(categoryId).name;
}

export async function findCompletionCandidate(
  database: CompletionLookupDatabase,
  input: { recipeId?: string; name: string; categoryId: number | null; ownerId: string | null },
): Promise<CompletionCandidate | null> {
  const rows = await database
    .select({ item: wishlistItems, recipeName: recipes.name, recipeImageUrl: recipes.imageUrl })
    .from(wishlistItems)
    .leftJoin(recipes, eq(recipes.id, wishlistItems.recipeId))
    .where(and(eq(wishlistItems.status, "pending"), ownerCondition(input.ownerId)));

  const recipeMatch = input.recipeId
    ? rows.find(({ item }) => item.recipeId === input.recipeId)
    : undefined;
  const normalizedName = normalizeDishName(input.name);
  const match = recipeMatch ?? rows.find(({ item }) =>
    normalizeDishName(item.nameKey) === normalizedName && item.categoryKey === categoryKey(input.categoryId));
  if (!match) return null;

  return {
    id: match.item.id,
    recipeId: match.item.recipeId,
    name: match.item.customName ?? match.recipeName ?? match.item.nameKey,
    imageUrl: match.recipeImageUrl,
  };
}

async function validateCompletionTarget(
  database: CompletionLookupDatabase,
  request: DishSaveRequest,
): Promise<CompletionCandidate | null> {
  if (!request.completeWishlist || !request.wishlistItemId) return null;
  const candidate = await findCompletionCandidate(database, request);
  return candidate?.id === request.wishlistItemId ? candidate : null;
}

export async function saveDishAndMaybeCompleteWish(
  database: DishWishlistDatabase,
  request: DishSaveRequest,
  options: { failAfterWishUpdate?: boolean } = {},
): Promise<DishSaveResult> {
  const name = request.name.trim();
  const candidates = await database
    .select({ id: dishes.id, name: dishes.name, imageUrl: dishes.imageUrl })
    .from(dishes);
  const duplicate = findDishNameMatch(name, candidates);
  if (duplicate) throw new DishTransactionError("duplicate", duplicate.message, duplicate);

  if (request.recipeId) {
    const [recipe] = await database
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.id, request.recipeId))
      .limit(1);
    if (!recipe) throw new DishTransactionError("recipe-not-found", "菜谱不存在");
  }

  const id = randomUUID();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  return database.transaction(async (transaction) => {
    await transaction.insert(dishes).values({
      id,
      name,
      nameKey: normalizeDishName(name),
      categoryId: request.categoryId,
      imageUrl: request.imageUrl,
      ingredients: JSON.stringify(request.ingredients),
      steps: JSON.stringify(request.steps),
      recipeId: request.recipeId ?? null,
      wishlistItemId: null,
      ownerId: request.ownerId,
      timesCooked: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (request.photoUploadId) {
      if (!request.imageUrl || !(await claimPhotoUpload(transaction, {
        id: request.photoUploadId,
        imageUrl: request.imageUrl,
        dishId: id,
        now: nowMs,
      }))) {
        throw new DishTransactionError("photo-unavailable", "照片已失效，请重新选择后保存");
      }
    }

    const completionTarget = await validateCompletionTarget(transaction, request);
    if (!completionTarget) return { id };

    const updated = await transaction
      .update(wishlistItems)
      .set({ status: "completed", completedAt: now, completedDishId: id, updatedAt: now })
      .where(and(
        eq(wishlistItems.id, completionTarget.id),
        eq(wishlistItems.status, "pending"),
        ownerCondition(request.ownerId),
      ))
      .returning({ id: wishlistItems.id });
    if (updated.length !== 1) return { id };
    if (options.failAfterWishUpdate) throw new Error("forced completion failure");

    await transaction
      .update(dishes)
      .set({ wishlistItemId: completionTarget.id })
      .where(eq(dishes.id, id));
    const [savedDish] = await transaction
      .select({ imageUrl: dishes.imageUrl })
      .from(dishes)
      .where(eq(dishes.id, id))
      .limit(1);

    await transaction.insert(wishlistCompletions).values({
      id: randomUUID(),
      ownerId: request.ownerId,
      wishlistItemId: completionTarget.id,
      recipeId: completionTarget.recipeId,
      completedDishId: id,
      addedAtSnapshot: (await transaction
        .select({ addedAt: wishlistItems.addedAt })
        .from(wishlistItems)
        .where(eq(wishlistItems.id, completionTarget.id))
        .limit(1))[0].addedAt,
      completedAt: now,
      nameSnapshot: completionTarget.name,
      imageUrlSnapshot: savedDish.imageUrl,
      createdAt: now,
    });

    return {
      id,
      wishlistCompletion: {
        id: completionTarget.id,
        name: completionTarget.name,
        imageUrl: savedDish.imageUrl,
      },
    };
  });
}
