import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "../../../db";
import { dishes } from "../../../db/schema";
import {
  DishTransactionError,
  saveDishAndMaybeCompleteWish,
  type DishSaveRequest,
  type DishWishlistDatabase,
} from "../../../lib/dish-wishlist-transaction";
import { withRetry } from "../../../lib/network-resilience";
import { isManagedDishBlobUrl } from "../../../lib/blob-delete";
import { verifyUploadCleanupToken } from "../../../lib/upload-cleanup-token";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function optionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createDishHandlers(
  database: DishWishlistDatabase,
  options: { cleanupSecret?: string } = {},
) {
  const cleanupSecret = options.cleanupSecret ?? process.env.BLOB_READ_WRITE_TOKEN ?? "";
  let lastSuccessfulDishes: (typeof dishes.$inferSelect)[] = [];

  return {
    async GET(request: Request): Promise<Response> {
      try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get("q") || "";
        const category = searchParams.get("cat") || "";
        const result = await withRetry(async () => {
          let query = database.select().from(dishes).orderBy(desc(dishes.createdAt));
          if (category) query = query.where(eq(dishes.categoryId, Number.parseInt(category, 10))) as typeof query;
          return query;
        }, 2);
        lastSuccessfulDishes = result;
        return NextResponse.json(q ? result.filter((dish) => dish.name.includes(q)) : result);
      } catch (error) {
        console.error("GET /api/dishes error:", error);
        if (lastSuccessfulDishes.length) {
          return NextResponse.json(lastSuccessfulDishes, { headers: { "X-Zhuzhu-Stale": "1" } });
        }
        return NextResponse.json({ error: "菜单服务暂时连接不上，请稍后重试" }, { status: 503 });
      }
    },

    async POST(request: Request): Promise<Response> {
      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
      }

      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "菜品名称不能为空" }, { status: 400 });
      }

      const categoryId = typeof body.categoryId === "number" && Number.isInteger(body.categoryId)
        ? body.categoryId
        : null;
      const imageUrl = typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null;
      const photoUploadId = optionalId(body.photoUploadId);
      const photoUploadToken = optionalId(body.photoUploadToken);
      if (isManagedDishBlobUrl(imageUrl ?? "") || photoUploadId || photoUploadToken) {
        const payload = photoUploadToken
          ? verifyUploadCleanupToken(photoUploadToken, cleanupSecret)
          : null;
        if (!imageUrl || !photoUploadId || !payload
          || payload.reservationId !== photoUploadId
          || payload.imageUrl !== imageUrl) {
          return NextResponse.json({ error: "照片上传凭证无效，请重新选择照片" }, { status: 400 });
        }
      }
      const saveRequest: DishSaveRequest = {
        name: body.name,
        categoryId,
        imageUrl,
        ingredients: stringArray(body.ingredients),
        steps: stringArray(body.steps),
        recipeId: optionalId(body.recipeId),
        wishlistItemId: optionalId(body.wishlistItemId),
        completeWishlist: body.completeWishlist === true,
        ownerId: null,
        photoUploadId,
      };

      try {
        return NextResponse.json(await saveDishAndMaybeCompleteWish(database, saveRequest));
      } catch (error) {
        console.error("POST /api/dishes error:", error);
        if (error instanceof DishTransactionError) {
          if (error.code === "duplicate") {
            return NextResponse.json({ error: error.message, match: error.match }, { status: 409 });
          }
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (String(error).toLowerCase().includes("unique")) {
          return NextResponse.json({ error: "菜单库已有这道菜" }, { status: 409 });
        }
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    },
  };
}

const handlers = createDishHandlers(db);
export const GET = handlers.GET;
export const POST = handlers.POST;
