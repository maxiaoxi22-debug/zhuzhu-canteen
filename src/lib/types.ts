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

export type DishDuplicateKind = "exact" | "normalized" | "similar";

export interface DishNameCandidate {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface DishDuplicateMatch extends DishNameCandidate {
  kind: DishDuplicateKind;
  message: string;
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

export interface HistoryEvent {
  id: string;
  type: "dish_created" | "meal_planned";
  eventTime: string;
  date: string;
  mealType?: string;
  dish: Dish;
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

export const MOCK_DISHES: Dish[] = [
  { id:"1", name:"红烧排骨", categoryId:1, imageUrl:null, ingredients:JSON.stringify(["排骨 500g","生抽 2勺","老抽 1勺","冰糖 15g","八角 2个","姜 3片","料酒 1勺"]), steps:JSON.stringify(["排骨冷水下锅加姜料酒焯水","炒糖色下排骨翻炒上色","加调料和热水炖40分钟","大火收汁装盘"]), timesCooked:12, createdAt:"2026-06-20", updatedAt:"2026-06-20" },
  { id:"2", name:"蒜蓉空心菜", categoryId:2, imageUrl:null, ingredients:JSON.stringify(["空心菜","大蒜","盐","蚝油"]), steps:JSON.stringify(["空心菜洗净切段","蒜切末热油爆香","下空心菜大火快炒","加蚝油盐调味出锅"]), timesCooked:9, createdAt:"2026-06-18", updatedAt:"2026-06-18" },
  { id:"3", name:"宫保鸡丁", categoryId:1, imageUrl:null, ingredients:JSON.stringify(["鸡胸肉","花生米","干辣椒","黄瓜","胡萝卜","豆瓣酱"]), steps:JSON.stringify(["鸡肉切丁腌制","花生米小火炒脆","爆香干辣椒豆瓣酱","下鸡丁翻炒","加配菜花生翻匀"]), timesCooked:7, createdAt:"2026-06-15", updatedAt:"2026-06-15" },
  { id:"4", name:"番茄蛋汤", categoryId:5, imageUrl:null, ingredients:JSON.stringify(["番茄","鸡蛋","葱","盐","香油"]), steps:JSON.stringify(["番茄去皮切块","炒软出汁加水烧开","淋入蛋液搅拌","加盐香油葱花"]), timesCooked:6, createdAt:"2026-06-12", updatedAt:"2026-06-12" },
  { id:"5", name:"清蒸鲈鱼", categoryId:4, imageUrl:null, ingredients:JSON.stringify(["鲈鱼","姜","葱","蒸鱼豉油","料酒"]), steps:JSON.stringify(["鱼洗净划刀塞姜片","水开上锅蒸8分钟","倒掉蒸出的水","淋蒸鱼豉油浇热油"]), timesCooked:5, createdAt:"2026-06-10", updatedAt:"2026-06-10" },
  { id:"6", name:"蛋炒饭", categoryId:3, imageUrl:null, ingredients:JSON.stringify(["隔夜米饭","鸡蛋","火腿肠","青豆","葱","盐"]), steps:JSON.stringify(["鸡蛋打散炒熟盛出","热油下米饭炒散","加火腿青豆翻炒","下鸡蛋葱花翻匀"]), timesCooked:8, createdAt:"2026-06-08", updatedAt:"2026-06-08" },
  { id:"7", name:"麻婆豆腐", categoryId:1, imageUrl:null, ingredients:JSON.stringify(["嫩豆腐","猪肉末","豆瓣酱","花椒粉","蒜苗"]), steps:JSON.stringify(["豆腐切块焯水","炒肉末至酥香","加豆瓣酱炒出红油","下豆腐炖3分钟","勾芡撒花椒粉蒜苗"]), timesCooked:4, createdAt:"2026-06-05", updatedAt:"2026-06-05" },
  { id:"8", name:"白灼西兰花", categoryId:2, imageUrl:null, ingredients:JSON.stringify(["西兰花","蒜末","生抽","蚝油","香油"]), steps:JSON.stringify(["西兰花焯水","捞出摆盘","蒜末+生抽+蚝油+香油调汁","淋在西兰花上"]), timesCooked:3, createdAt:"2026-06-01", updatedAt:"2026-06-01" },
];
