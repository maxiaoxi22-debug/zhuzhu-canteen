export interface RecipeSuggestion {
  name: string;
  category: string;
  ingredients: string[];
  steps: string[];
  source: "template" | "gemini";
}

export interface EditableRecipeFields {
  category: string;
  ingredients: string;
  steps: string;
}

function mainIngredient(name: string) {
  return name.replace(/红烧|清蒸|白灼|爆炒|小炒|炒|炖|煎|汤|面|饭/g, "").trim() || name;
}

function categoryFor(name: string) {
  if (/鱼|虾|蟹|贝|海鲜/.test(name)) return "海鲜";
  if (/猪|牛|羊|鸡|鸭|鹅|肉|排骨|蹄/.test(name)) return "肉类";
  if (/饭|面|饼|粥|馒头/.test(name)) return "主食";
  if (/汤|羹/.test(name)) return "汤类";
  if (/菜|瓜|豆|笋|菇|茄|藕/.test(name)) return "青菜";
  return "其他";
}

export function generateFallbackRecipe(name: string): RecipeSuggestion {
  const main = mainIngredient(name);
  const common = [main, "姜 适量", "葱 适量", "盐 适量"];
  let ingredients = common;
  let steps = [`将${main}处理干净并切成合适大小`, "准备葱姜等配料", "烹制至熟透，调味后出锅"];

  if (/红烧/.test(name)) {
    ingredients = [main, "姜 3片", "葱 适量", "生抽 2勺", "老抽 半勺", "冰糖 适量", "料酒 1勺"];
    steps = [`${main}处理干净，按需要焯水`, "少油炒香葱姜和冰糖", `放入${main}翻炒，加入生抽、老抽和料酒`, "加热水没过食材，小火焖至软烂", "大火收汁，尝味后出锅"];
  } else if (/清蒸/.test(name)) {
    ingredients = [main, "姜 3片", "葱 适量", "蒸鱼豉油 适量", "食用油 适量"];
    steps = [`${main}处理干净并沥水`, "铺上姜片，水开后上锅蒸至熟", "倒去多余汤汁，放葱丝", "淋蒸鱼豉油和热油后上桌"];
  } else if (/白灼/.test(name)) {
    steps = [`${main}处理干净`, "锅中烧水，加入姜片和少量料酒", `放入${main}灼至刚熟`, "捞出沥水，搭配蘸汁食用"];
  } else if (/炒/.test(name)) {
    steps = [`${main}洗净切好`, "热锅下油，爆香葱姜蒜", `大火放入${main}快速翻炒`, "调味并炒至熟透后出锅"];
  } else if (/炖/.test(name)) {
    steps = [`${main}处理干净并按需焯水`, "葱姜爆香后加入主料", "加足量热水，小火慢炖", "炖至软烂后加盐调味"];
  } else if (/汤|羹/.test(name)) {
    steps = [`${main}处理干净`, "锅中加水或高汤烧开", `加入${main}煮至熟透`, "调味后撒葱花出锅"];
  } else if (/面/.test(name)) {
    ingredients = [main, "面条 适量", "青菜 适量", "生抽 1勺", "盐 适量"];
  } else if (/饭/.test(name)) {
    ingredients = [main, "米饭 1碗", "鸡蛋 1个", "葱花 适量", "盐 适量"];
  }

  return { name, category: categoryFor(name), ingredients, steps, source: "template" };
}

export function mergeRecipeFields(current: EditableRecipeFields, suggestion: RecipeSuggestion): EditableRecipeFields {
  return {
    category: current.category || suggestion.category,
    ingredients: current.ingredients.trim() || suggestion.ingredients.join("\n"),
    steps: current.steps.trim() || suggestion.steps.join("\n"),
  };
}
