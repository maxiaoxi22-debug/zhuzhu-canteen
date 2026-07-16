export type CategoryKey = "肉类" | "海鲜" | "汤类" | "主食" | "青菜" | "其他";

const CATEGORY_BY_FOLDER: Readonly<Record<string, CategoryKey>> = {
  meat_dish: "肉类",
  aquatic: "海鲜",
  soup: "汤类",
  staple: "主食",
  vegetable_dish: "青菜",
  breakfast: "主食",
  dessert: "其他",
  drink: "其他",
  condiment: "其他",
  "semi-finished": "其他",
};

export function normalizeRecipeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export function mapHowToCookCategory(sourcePath: string): CategoryKey {
  const segments = sourcePath.replaceAll("\\", "/").split("/");
  const dishesIndex = segments.indexOf("dishes");
  const folder = dishesIndex >= 0 ? segments[dishesIndex + 1] : undefined;
  const category = folder ? CATEGORY_BY_FOLDER[folder] : undefined;

  if (!category) {
    throw new Error(`Unknown HowToCook category folder: ${folder ?? "(missing)"}`);
  }

  return category;
}
