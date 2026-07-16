import type { CategoryKey } from "@/lib/types";

export type VisionProviderName = "gemini" | "ollama";

export type VisionCandidate = {
  name: string;
  category: CategoryKey;
};

export type VisionRecognitionPayload = {
  candidates: VisionCandidate[];
  visibleIngredients: string[];
};

export type VisionRecognitionResult = VisionRecognitionPayload & {
  provider: VisionProviderName;
  requestId: string;
};

export interface VisionProvider {
  name: VisionProviderName;
  recognize(input: {
    bytes: Uint8Array;
    mimeType: string;
    signal: AbortSignal;
  }): Promise<unknown>;
}
