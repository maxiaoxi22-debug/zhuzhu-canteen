import { NextResponse } from "next/server";

import { db } from "../../../../db";
import {
  removePendingWishlistItem,
  type WishlistDatabase,
} from "../../../../lib/wishlist-repository";

interface WishlistRouteContext {
  params: Promise<{ id: string }>;
}

export function createWishlistDeleteHandler(database: WishlistDatabase) {
  return async function DELETE(_request: Request, context: WishlistRouteContext): Promise<Response> {
    const { id } = await context.params;
    const removed = await removePendingWishlistItem(database, id, null);
    if (!removed) {
      return NextResponse.json({ error: "待完成心愿不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  };
}

export const DELETE = createWishlistDeleteHandler(db);
