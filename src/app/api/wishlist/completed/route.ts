import { NextResponse } from "next/server";

import { db } from "../../../../db";
import {
  listWishlistCompletions,
  type WishlistDatabase,
} from "../../../../lib/wishlist-repository";

export function createCompletedWishlistHandler(database: WishlistDatabase) {
  return async function GET(): Promise<Response> {
    const items = await listWishlistCompletions(database, null);
    return NextResponse.json({ items });
  };
}

export const GET = createCompletedWishlistHandler(db);
