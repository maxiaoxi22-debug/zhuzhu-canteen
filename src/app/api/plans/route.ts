import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "../../../db";
import { dishes, mealPlans, recipes, wishlistItems } from "../../../db/schema";
import { getCategoryMeta } from "../../../lib/categories";
import type { WishlistDatabase } from "../../../lib/wishlist-repository";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function badRequest(error: string): Response {
  return NextResponse.json({ error }, { status: 400 });
}

export function createPlanHandlers(database: WishlistDatabase) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const date = new URL(request.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
        const rows = await database
          .select({
            plan: mealPlans,
            dishName: dishes.name,
            dishCategoryId: dishes.categoryId,
            dishImageUrl: dishes.imageUrl,
            wishName: wishlistItems.customName,
            wishCategoryKey: wishlistItems.categoryKey,
            recipeName: recipes.name,
            recipeImageUrl: recipes.imageUrl,
          })
          .from(mealPlans)
          .leftJoin(dishes, eq(dishes.id, mealPlans.dishId))
          .leftJoin(wishlistItems, eq(wishlistItems.id, mealPlans.wishlistItemId))
          .leftJoin(recipes, eq(recipes.id, mealPlans.recipeId))
          .where(eq(mealPlans.date, date));

        return NextResponse.json(rows.map((row) => {
          const sourceType = row.plan.sourceType === "wishlist" ? "wishlist" : "dish";
          return {
            ...row.plan,
            sourceType,
            name: sourceType === "wishlist" ? row.wishName ?? row.recipeName : row.dishName,
            categoryId: sourceType === "dish" ? row.dishCategoryId : null,
            categoryKey: sourceType === "wishlist"
              ? row.wishCategoryKey
              : row.dishCategoryId === null ? null : getCategoryMeta(row.dishCategoryId).name,
            imageUrl: sourceType === "wishlist" ? row.recipeImageUrl : row.dishImageUrl,
          };
        }));
      } catch (error) {
        console.error("GET /api/plans error:", error);
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
    },

    async POST(request: Request): Promise<Response> {
      try {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return badRequest("请求内容无效");
        }
        if (typeof body !== "object" || body === null) return badRequest("请求内容无效");
        const { date, mealType, dishId, wishlistItemId, notes } = body as Record<string, unknown>;
        const hasDish = typeof dishId === "string" && dishId.trim().length > 0;
        const hasWish = typeof wishlistItemId === "string" && wishlistItemId.trim().length > 0;
        if (hasDish === hasWish) return badRequest("只能选择饭盆菜品或心愿菜中的一种");
        if (typeof date !== "string" || !date || typeof mealType !== "string" || !mealType) {
          return badRequest("Missing required fields");
        }

        if (hasWish) {
          const [wish] = await database
            .select({ recipeId: wishlistItems.recipeId })
            .from(wishlistItems)
            .where(and(
              eq(wishlistItems.id, (wishlistItemId as string).trim()),
              eq(wishlistItems.status, "pending"),
              isNull(wishlistItems.ownerId),
            ))
            .limit(1);
          if (!wish) return NextResponse.json({ error: "待完成心愿不存在" }, { status: 404 });
          await database.insert(mealPlans).values({
            date,
            mealType,
            dishId: null,
            recipeId: wish.recipeId,
            wishlistItemId: (wishlistItemId as string).trim(),
            sourceType: "wishlist",
            ownerId: null,
            notes: typeof notes === "string" && notes.length > 0 ? notes : null,
            createdAt: new Date().toISOString(),
          });
        } else {
          await database.insert(mealPlans).values({
            date,
            mealType,
            dishId: (dishId as string).trim(),
            recipeId: null,
            wishlistItemId: null,
            sourceType: "dish",
            ownerId: null,
            notes: typeof notes === "string" && notes.length > 0 ? notes : null,
            createdAt: new Date().toISOString(),
          });
        }

        return NextResponse.json({ success: true });
      } catch (error) {
        console.error("POST /api/plans error:", error);
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
    },

    async DELETE(request: Request): Promise<Response> {
      try {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return badRequest("id required");
        await database.delete(mealPlans).where(eq(mealPlans.id, Number.parseInt(id, 10)));
        return NextResponse.json({ success: true });
      } catch (error) {
        console.error("DELETE /api/plans error:", error);
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
    },
  };
}

const handlers = createPlanHandlers(db);
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
