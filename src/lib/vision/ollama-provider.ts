import type { VisionProvider } from "./types";

const VISION_PROMPT = `分析这张中餐成品照片，只返回 JSON：{"candidates":[{"name":"候选菜名","category":"肉类"}],"visibleIngredients":["可见食材"]}。candidates 最多 3 个；category 只能是肉类、青菜、主食、海鲜、汤类、其他；visibleIngredients 最多 12 个；不要返回用量或制作步骤。`;

type OllamaResponse = {
  message?: { content?: unknown };
  response?: unknown;
};

export function createOllamaProvider(options: {
  baseUrl?: string;
  model?: string;
} = {}): VisionProvider {
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = options.model ?? process.env.OLLAMA_VISION_MODEL ?? "qwen3-vl:4b-instruct-q4_K_M";

  return {
    name: "ollama",
    async recognize({ bytes, signal }) {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: [{ role: "user", content: VISION_PROMPT, images: [Buffer.from(bytes).toString("base64")] }],
        }),
        signal,
      });
      if (!response.ok) throw new Error(`ollama_http_${response.status}`);
      const data = await response.json() as OllamaResponse;
      const content = data.message?.content ?? data.response;
      if (typeof content !== "string") throw new Error("ollama_invalid_response");
      return JSON.parse(content);
    },
  };
}
