import { db } from "@/db";
import { dishes } from "@/db/schema";
import { findDishNameMatch } from "./dish-name-match";

export async function findDishDuplicate(name: string, excludeId?: string) {
  const candidates = await db
    .select({ id: dishes.id, name: dishes.name, imageUrl: dishes.imageUrl })
    .from(dishes);
  return findDishNameMatch(name, candidates, excludeId);
}
