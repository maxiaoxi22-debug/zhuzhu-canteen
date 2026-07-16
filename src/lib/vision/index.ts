import { createGeminiProvider } from "./gemini-provider";
import { createOllamaProvider } from "./ollama-provider";
import type { VisionProvider, VisionProviderName, VisionRecognitionResult } from "./types";
import { validateRecognition } from "./validate";

export type VisionErrorCode = "timeout" | "unavailable" | "invalid_response";

export class VisionRecognitionError extends Error {
  constructor(
    public readonly code: VisionErrorCode,
    public readonly requestId: string,
  ) {
    super("Dish recognition is unavailable");
    this.name = "VisionRecognitionError";
  }
}

export type VisionEnvironment = {
  NODE_ENV?: string;
  VISION_PROVIDER?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_VISION_MODEL?: string;
  GEMINI_API_KEY?: string;
};

export type VisionConfig = {
  primary: VisionProviderName;
  fallback?: VisionProviderName;
  ollamaBaseUrl: string;
  ollamaModel: string;
};

export function resolveVisionConfig(env: VisionEnvironment = process.env): VisionConfig {
  const ollamaBaseUrl = env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const ollamaModel = env.OLLAMA_VISION_MODEL ?? "qwen3-vl:4b-instruct-q4_K_M";
  if (env.NODE_ENV !== "production" && env.VISION_PROVIDER === "ollama") {
    return { primary: "ollama", fallback: "gemini", ollamaBaseUrl, ollamaModel };
  }
  return { primary: "gemini", fallback: undefined, ollamaBaseUrl, ollamaModel };
}

type RecognitionInput = {
  bytes: Uint8Array;
  mimeType: string;
  requestId: string;
};

type RecognitionOptions = {
  primary: VisionProvider;
  fallback?: VisionProvider;
  timeoutMs?: number;
};

function isAbortError(error: unknown): boolean {
  return error instanceof ProviderTimeoutError
    || (error instanceof DOMException && error.name === "AbortError");
}

class ProviderTimeoutError extends Error {}

async function runAttempt(provider: VisionProvider, input: RecognitionInput, timeoutMs: number) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError("vision_provider_timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      provider.recognize({
        bytes: input.bytes,
        mimeType: input.mimeType,
        signal: controller.signal,
      }),
      deadline,
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

export async function recognizeWithProviders(
  input: RecognitionInput,
  options: RecognitionOptions,
): Promise<VisionRecognitionResult> {
  const providers = options.fallback ? [options.primary, options.fallback] : [options.primary];
  const timeoutMs = options.timeoutMs ?? 20_000;
  let lastCode: VisionErrorCode = "unavailable";

  for (const provider of providers) {
    const attempts = provider.name === "gemini" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      try {
        const raw = await runAttempt(provider, input, timeoutMs);
        const validated = validateRecognition(raw);
        if (validated.candidates.length === 0) {
          lastCode = "invalid_response";
          console.warn("Vision provider attempt failed", {
            requestId: input.requestId,
            provider: provider.name,
            elapsedMs: Date.now() - attemptStartedAt,
            errorType: lastCode,
          });
          continue;
        }
        return { ...validated, provider: provider.name, requestId: input.requestId };
      } catch (error) {
        lastCode = isAbortError(error) ? "timeout" : "unavailable";
        console.warn("Vision provider attempt failed", {
          requestId: input.requestId,
          provider: provider.name,
          elapsedMs: Date.now() - attemptStartedAt,
          errorType: lastCode,
        });
      }
    }
  }

  throw new VisionRecognitionError(lastCode, input.requestId);
}

export function createConfiguredVisionProviders(env: VisionEnvironment = process.env): RecognitionOptions {
  const config = resolveVisionConfig(env);
  const gemini = createGeminiProvider(env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY);
  if (config.primary === "ollama") {
    return {
      primary: createOllamaProvider({ baseUrl: config.ollamaBaseUrl, model: config.ollamaModel }),
      fallback: gemini,
    };
  }
  return { primary: gemini };
}

export type { VisionCandidate, VisionProvider, VisionRecognitionPayload, VisionRecognitionResult } from "./types";
