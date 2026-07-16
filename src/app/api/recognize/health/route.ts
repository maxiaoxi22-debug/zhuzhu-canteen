import { NextResponse } from "next/server";
import { resolveVisionConfig, type VisionEnvironment } from "../../../../lib/vision";

type HealthEnvironment = VisionEnvironment & { GEMINI_API_KEY?: string };
type OllamaCheck = (baseUrl: string) => Promise<boolean>;

async function checkOllama(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function createRecognitionHealthHandler(
  env: HealthEnvironment = process.env,
  ollamaCheck: OllamaCheck = checkOllama,
) {
  return async function recognitionHealthHandler() {
    if (env.NODE_ENV === "production") {
      return new NextResponse(null, { status: 404 });
    }

    const config = resolveVisionConfig(env);
    const ollamaReachable = config.primary === "ollama"
      ? await ollamaCheck(config.ollamaBaseUrl)
      : false;
    return NextResponse.json({
      configuredProvider: config.primary,
      ollamaReachable,
      geminiConfigured: Boolean(env.GEMINI_API_KEY),
    });
  };
}

export const GET = createRecognitionHealthHandler();
