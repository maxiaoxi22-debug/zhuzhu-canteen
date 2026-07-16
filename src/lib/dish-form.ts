import { CATEGORIES } from "./types";
import { DishDuplicateMatch } from "./types";

export function applyRecognitionCandidate(
  currentCategory: string,
  categoryTouched: boolean,
  candidate: { name: string; category: string },
): { name: string; category: string } {
  return {
    name: candidate.name,
    category: categoryTouched ? currentCategory : candidate.category,
  };
}

export function createLatestTaskGuard() {
  let revision = 0;
  return {
    begin(): number {
      revision += 1;
      return revision;
    },
    current(): number {
      return revision;
    },
    isCurrent(candidateRevision: number): boolean {
      return candidateRevision === revision;
    },
  };
}

export function buildWishlistCompletionFields(
  candidate: { id: string; recipeId: string | null },
  completeWishlist: boolean,
) {
  return {
    recipeId: candidate.recipeId ?? undefined,
    wishlistItemId: candidate.id,
    completeWishlist,
  };
}

export interface PendingSaveSnapshot {
  readonly revision: number;
  readonly name: string;
  readonly categoryId: number | null;
  readonly categoryKey: string;
  readonly imageUrl: string;
  readonly ingredients: readonly string[];
  readonly steps: readonly string[];
  readonly recipeId: string | null;
  readonly photoUploadId: string | null;
  readonly photoUploadToken: string | null;
}

export function createPendingSaveSnapshot(
  revision: number,
  input: Omit<PendingSaveSnapshot, "revision">,
): PendingSaveSnapshot {
  return Object.freeze({
    ...input,
    revision,
    ingredients: Object.freeze([...input.ingredients]),
    steps: Object.freeze([...input.steps]),
  });
}

export class DishSaveError extends Error {
  constructor(message: string, public match?: DishDuplicateMatch) {
    super(message);
  }
}

export function categoryIdFromKey(category: string): number | null {
  const index = CATEGORIES.findIndex(
    (item) => item.key === category || item.label === category,
  );
  return index > 0 ? index : null;
}

export async function readDishSaveResult(
  response: Response,
): Promise<{
  id: string;
  wishlistCompletion?: { id: string; name: string; imageUrl: string | null };
}> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DishSaveError(data.error || "保存失败，请检查网络后重试", data.match);
  }
  return data;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function saveDishOnce(
  fetcher: FetchLike,
  url: string,
  method: "POST" | "PUT",
  payload: Record<string, unknown>,
) {
  const response = await fetcher(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readDishSaveResult(response);
}
