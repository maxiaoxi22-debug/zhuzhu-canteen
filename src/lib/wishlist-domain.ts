import { normalizeRecipeName } from "./recipe-normalize";

export interface WishlistMatchItem {
  id: string;
  recipeId: string | null;
  nameKey: string;
  categoryKey: string;
  status: "pending" | "completed";
}

export interface WishlistMatchCandidate {
  recipeId: string | null;
  name: string;
  categoryKey: string;
}

export function findPendingWishlistMatch<T extends WishlistMatchItem>(
  items: readonly T[],
  candidate: WishlistMatchCandidate,
): T | null {
  const pendingItems = items.filter((item) => item.status === "pending");
  if (candidate.recipeId) {
    const recipeMatch = pendingItems.find((item) => item.recipeId === candidate.recipeId);
    if (recipeMatch) return recipeMatch;
  }

  const nameKey = normalizeRecipeName(candidate.name);
  return pendingItems.find((item) =>
    item.nameKey === nameKey && item.categoryKey === candidate.categoryKey) ?? null;
}
