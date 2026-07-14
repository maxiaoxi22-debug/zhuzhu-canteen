import { DishDuplicateKind, DishDuplicateMatch, DishNameCandidate } from "./types";

const removable = /[\s\p{P}\p{S}]+/gu;

export function normalizeDishName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase().replace(removable, "");
}

function withoutErSuffix(value: string): string {
  return value.endsWith("儿") ? value.slice(0, -1) : value;
}

export function findDishNameMatch(
  name: string,
  candidates: DishNameCandidate[],
  excludeId?: string,
): DishDuplicateMatch | null {
  const eligible = candidates.filter((dish) => dish.id !== excludeId);
  const trimmed = name.trim();
  const normalized = normalizeDishName(name);
  if (!normalized) return null;

  const exact = eligible.find((dish) => dish.name.trim() === trimmed);
  const normalizedMatch = eligible.find((dish) => normalizeDishName(dish.name) === normalized);
  const similar = eligible.find((dish) => {
    const candidate = normalizeDishName(dish.name);
    return candidate !== normalized && withoutErSuffix(candidate) === withoutErSuffix(normalized);
  });
  const hit = exact ?? normalizedMatch ?? similar;
  if (!hit) return null;
  const kind: DishDuplicateKind = exact ? "exact" : normalizedMatch ? "normalized" : "similar";
  return { ...hit, kind, message: kind === "similar" ? "可能已经记录" : "菜单库已有这道菜" };
}
