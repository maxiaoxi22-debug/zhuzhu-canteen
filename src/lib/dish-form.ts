import { CATEGORIES } from "./types";
import { DishDuplicateMatch } from "./types";

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
): Promise<{ id: string }> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DishSaveError(data.error || "保存失败，请检查网络后重试", data.match);
  }
  return data;
}
