import type { CategoryKey } from "@/lib/types";
import type { VisionCandidate, VisionRecognitionPayload } from "./types";

const CATEGORIES = new Set<CategoryKey>(["肉类", "青菜", "主食", "海鲜", "汤类", "其他"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRecognition(value: unknown): VisionRecognitionPayload {
  if (!isRecord(value)) return { candidates: [], visibleIngredients: [] };

  const candidates: VisionCandidate[] = [];
  const candidateNames = new Set<string>();
  if (Array.isArray(value.candidates)) {
    for (const item of value.candidates) {
      if (candidates.length === 3) break;
      if (!isRecord(item) || typeof item.name !== "string" || typeof item.category !== "string") continue;
      const name = item.name.trim();
      if (!name || !CATEGORIES.has(item.category as CategoryKey) || candidateNames.has(name)) continue;
      candidateNames.add(name);
      candidates.push({ name, category: item.category as CategoryKey });
    }
  }

  const visibleIngredients: string[] = [];
  const ingredientNames = new Set<string>();
  if (Array.isArray(value.visibleIngredients)) {
    for (const item of value.visibleIngredients) {
      if (visibleIngredients.length === 12) break;
      if (typeof item !== "string") continue;
      const name = item.trim();
      if (!name || ingredientNames.has(name)) continue;
      ingredientNames.add(name);
      visibleIngredients.push(name);
    }
  }

  return { candidates, visibleIngredients };
}
