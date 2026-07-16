import { GoogleGenerativeAI } from "@google/generative-ai";
import type { VisionProvider } from "./types";

const VISION_PROMPT = `你是中餐菜品识别助手。分析成品菜照片，只返回 JSON：
{"candidates":[{"name":"候选菜名","category":"肉类"}],"visibleIngredients":["可见食材"]}
要求：
- candidates 最多 3 个，按可能性从高到低排列
- category 只能是：肉类、青菜、主食、海鲜、汤类、其他
- visibleIngredients 最多 12 个，只写照片中可见的食材
- 不要返回用量、制作步骤或 JSON 以外的内容`;

function parseJsonResponse(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned);
}

export function createGeminiProvider(apiKey = process.env.GEMINI_API_KEY): VisionProvider {
  return {
    name: "gemini",
    async recognize({ bytes, mimeType, signal }) {
      if (!apiKey) throw new Error("gemini_not_configured");
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent([
        VISION_PROMPT,
        { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } },
      ], { signal });
      return parseJsonResponse(result.response.text());
    },
  };
}
