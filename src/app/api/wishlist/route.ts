import { NextResponse } from "next/server";

import { db } from "../../../db";
import {
  addWishlistItem,
  listWishlistItems,
  type WishlistDatabase,
} from "../../../lib/wishlist-repository";

export function createWishlistHandlers(database: WishlistDatabase) {
  return {
    async GET(request: Request): Promise<Response> {
      const status = new URL(request.url).searchParams.get("status");
      if (status !== null && status !== "pending") {
        return NextResponse.json({ error: "不支持的心愿状态" }, { status: 400 });
      }

      return NextResponse.json(await listWishlistItems(database, null));
    },

    async POST(request: Request): Promise<Response> {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
      }
      const recipeId = typeof body === "object" && body !== null && "recipeId" in body
        ? (body as { recipeId?: unknown }).recipeId
        : undefined;
      if (typeof recipeId !== "string" || recipeId.trim().length === 0) {
        return NextResponse.json({ error: "recipeId 必填" }, { status: 400 });
      }

      const result = await addWishlistItem(database, recipeId, null);
      if (result.kind === "recipe-not-found") {
        return NextResponse.json({ error: "菜谱不存在" }, { status: 404 });
      }
      if (result.kind === "duplicate") {
        return NextResponse.json({
          error: "已经在猪猪心愿单里啦",
          itemId: result.itemId,
        }, { status: 409 });
      }
      return NextResponse.json({ item: result.item }, { status: 201 });
    },
  };
}

const handlers = createWishlistHandlers(db);
export const GET = handlers.GET;
export const POST = handlers.POST;
