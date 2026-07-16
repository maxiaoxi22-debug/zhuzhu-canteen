export type RecipeMatchRank = 0 | 1 | 2 | null;

export function rankRecipeMatch(
  queryKey: string,
  nameKey: string,
  aliasKeys: readonly string[],
): RecipeMatchRank {
  if (nameKey === queryKey) return 0;
  if (aliasKeys.includes(queryKey)) return 1;
  if (nameKey.includes(queryKey) || aliasKeys.some((aliasKey) => aliasKey.includes(queryKey))) return 2;
  return null;
}
