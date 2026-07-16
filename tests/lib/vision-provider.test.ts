import { describe, expect, it, vi } from "vitest";
import {
  recognizeWithProviders,
  resolveVisionConfig,
} from "../../src/lib/vision";
import type { VisionProvider } from "../../src/lib/vision/types";

function fakeProvider(
  name: VisionProvider["name"],
  recognize: VisionProvider["recognize"],
): VisionProvider {
  return { name, recognize };
}

const input = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/jpeg",
  requestId: "request-123",
};

const validOutput = {
  candidates: [{ name: "红烧排骨", category: "肉类" }],
  visibleIngredients: ["排骨"],
};

describe("recognizeWithProviders", () => {
  it("retries Gemini exactly once before succeeding", async () => {
    const recognize = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(validOutput);
    const gemini = fakeProvider("gemini", recognize);

    const result = await recognizeWithProviders(input, {
      primary: gemini,
      timeoutMs: 50,
    });

    expect(recognize).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ provider: "gemini", requestId: "request-123" });
  });

  it("falls back from Ollama to Gemini on a LAN configuration", async () => {
    const ollama = fakeProvider("ollama", vi.fn().mockRejectedValue(new Error("offline")));
    const gemini = fakeProvider("gemini", vi.fn().mockResolvedValue(validOutput));

    const result = await recognizeWithProviders(input, {
      primary: ollama,
      fallback: gemini,
      timeoutMs: 50,
    });

    expect(ollama.recognize).toHaveBeenCalledTimes(1);
    expect(gemini.recognize).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("gemini");
  });

  it("maps an exhausted provider timeout to a safe timeout error", async () => {
    const gemini = fakeProvider("gemini", vi.fn(() => new Promise(() => {})));
    const watchdog = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("recognition did not enforce its timeout")), 100);
    });

    await expect(Promise.race([
      recognizeWithProviders(input, { primary: gemini, timeoutMs: 5 }),
      watchdog,
    ])).rejects.toMatchObject({
      name: "VisionRecognitionError",
      code: "timeout",
      requestId: "request-123",
    });
    expect(gemini.recognize).toHaveBeenCalledTimes(2);
  });

  it("rejects structurally invalid output and falls back", async () => {
    const ollama = fakeProvider("ollama", vi.fn().mockResolvedValue({ candidates: "invalid" }));
    const gemini = fakeProvider("gemini", vi.fn().mockResolvedValue(validOutput));

    const result = await recognizeWithProviders(input, {
      primary: ollama,
      fallback: gemini,
      timeoutMs: 50,
    });

    expect(result.provider).toBe("gemini");
  });

  it("logs safe failure metadata without provider error contents or image bytes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ollama = fakeProvider("ollama", vi.fn().mockRejectedValue(
      new Error("SECRET_BASE64_CONTENT"),
    ));

    try {
      await expect(recognizeWithProviders(input, {
        primary: ollama,
        timeoutMs: 50,
      })).rejects.toBeInstanceOf(Error);

      const serializedLogs = JSON.stringify(warn.mock.calls);
      expect(serializedLogs).toContain('"provider":"ollama"');
      expect(serializedLogs).toContain('"requestId":"request-123"');
      expect(serializedLogs).toContain('"errorType":"unavailable"');
      expect(serializedLogs).not.toContain("SECRET_BASE64_CONTENT");
      expect(serializedLogs).not.toContain("1,2,3");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("resolveVisionConfig", () => {
  it("uses Ollama with Gemini fallback only outside production", () => {
    expect(resolveVisionConfig({ NODE_ENV: "development", VISION_PROVIDER: "ollama" }))
      .toMatchObject({ primary: "ollama", fallback: "gemini" });
  });

  it("forces Gemini-only configuration in production", () => {
    expect(resolveVisionConfig({ NODE_ENV: "production", VISION_PROVIDER: "ollama" }))
      .toMatchObject({ primary: "gemini", fallback: undefined });
  });
});
