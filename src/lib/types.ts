export interface Dish {
  id: string;
  name: string;
  categoryId: number | null;
  imageUrl: string | null;
  ingredients: string;
  steps: string;
  timesCooked: number;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlan {
  id: number;
  date: string;
  mealType: string;
  dishId: string | null;
  notes: string | null;
  createdAt: string;
  dish?: Dish | null;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface RecognitionResult {
  name: string;
  category: string;
  ingredients: string[];
  steps: string[];
  imageUrl: string;
}

export const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "肉类", label: "🥩 肉类" },
  { key: "青菜", label: "🥬 青菜" },
  { key: "主食", label: "🍚 主食" },
  { key: "海鲜", label: "🦐 海鲜" },
  { key: "汤类", label: "🍲 汤类" },
  { key: "其他", label: "其他" },
];

export const MEAL_TYPES = [
  { key: "breakfast", label: "早餐", emoji: "🌅" },
  { key: "lunch", label: "午餐", emoji: "☀️" },
  { key: "dinner", label: "晚餐", emoji: "🌙" },
];