import { describe, expect, it } from "vitest";

import { resolveVisionConfig } from "../../src/lib/vision";

describe("local vision configuration", () => {
  it("uses Ollama locally with the loopback endpoint and Gemini fallback", () => {
    expect(resolveVisionConfig({ NODE_ENV: "development", VISION_PROVIDER: "ollama" }))
      .toMatchObject({
        primary: "ollama",
        fallback: "gemini",
        ollamaBaseUrl: "http://127.0.0.1:11434",
      });
  });

  it("never selects the LAN-only Ollama provider in production", () => {
    expect(resolveVisionConfig({ NODE_ENV: "production", VISION_PROVIDER: "ollama" }).primary)
      .toBe("gemini");
  });
});
