import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function recognizeDish(imageBase64: string, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `你是一个中餐菜品识别专家。请分析这张菜品照片，返回JSON格式（只返回JSON，不要其他文字）：

{
  "name": "菜品名称",
  "category": "分类(肉类/青菜/主食/海鲜/汤类/其他)",
  "ingredients": ["食材1", "食材2", "食材3"],
  "steps": ["步骤1", "步骤2", "步骤3"]
}

要求：
- name: 准确的菜品名称
- category: 从"肉类、青菜、主食、海鲜、汤类、其他"中选择最合适的
- ingredients: 列出主要食材，每项包含用量
- steps: 简述做法步骤，3-6步为宜`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType, data: imageBase64 } },
  ]);

  const text = result.response.text();
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

export async function generateRecipeFromName(name: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(`请根据中餐菜名“${name}”生成参考菜谱。只返回 JSON：{"name":"菜名","category":"肉类/青菜/主食/海鲜/汤类/其他","ingredients":["食材和用量"],"steps":["步骤"]}`);
  const cleaned = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}
