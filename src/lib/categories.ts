export interface CategoryMeta {
  id: number;
  name: string;
  icon: string;
  className: string;
  achievement: string;
}

export const CATEGORY_META: readonly CategoryMeta[] = [
  { id: 1, name: "肉类", icon: "🥩", className: "category-meat", achievement: "肉肉达人" },
  { id: 2, name: "青菜", icon: "🥬", className: "category-veg", achievement: "蔬菜勇士" },
  { id: 3, name: "主食", icon: "🍚", className: "category-rice", achievement: "主食冠军" },
  { id: 4, name: "海鲜", icon: "🦐", className: "category-sea", achievement: "海鲜新星" },
  { id: 5, name: "汤类", icon: "🍲", className: "category-soup", achievement: "喝汤高手" },
  { id: 6, name: "其他", icon: "🍳", className: "category-other", achievement: "惊喜探索家" },
] as const;

export function getCategoryMeta(categoryId: number | null): CategoryMeta {
  return CATEGORY_META.find((item) => item.id === categoryId) ?? CATEGORY_META[5];
}
