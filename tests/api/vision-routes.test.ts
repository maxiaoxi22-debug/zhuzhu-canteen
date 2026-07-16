import { describe, expect, it, vi } from "vitest";
import { createDishPhotoUploadHandler } from "../../src/app/api/uploads/dish-photo/route";
import { createRecognizeHandler } from "../../src/app/api/recognize/route";
import { createRecognitionHealthHandler } from "../../src/app/api/recognize/health/route";
import { VisionRecognitionError } from "../../src/lib/vision";

function multipartRequest(path: string, file?: File): Request {
  const formData = new FormData();
  if (file) formData.append("image", file);
  return new Request(`http://local.test${path}`, { method: "POST", body: formData });
}

describe("POST /api/uploads/dish-photo", () => {
  it("accepts an image and returns only its stable URL", async () => {
    const upload = vi.fn().mockResolvedValue("https://blob.test/dish.jpg");
    const response = await createDishPhotoUploadHandler(upload)(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1, 2])], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ imageUrl: "https://blob.test/dish.jpg" });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("rejects non-images and images over 10 MB before upload", async () => {
    const upload = vi.fn();
    const wrongType = await createDishPhotoUploadHandler(upload)(multipartRequest(
      "/api/uploads/dish-photo",
      new File(["text"], "dish.txt", { type: "text/plain" }),
    ));
    const tooLarge = await createDishPhotoUploadHandler(upload)(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(wrongType.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("POST /api/recognize", () => {
  it("returns provider-neutral candidates without an image URL", async () => {
    const recognize = vi.fn().mockResolvedValue({
      candidates: [{ name: "红烧排骨", category: "肉类" }],
      visibleIngredients: ["排骨"],
      provider: "gemini",
      requestId: "request-123",
    });
    const response = await createRecognizeHandler(recognize, () => "request-123")(multipartRequest(
      "/api/recognize",
      new File([new Uint8Array([1, 2])], "dish.jpg", { type: "image/jpeg" }),
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("imageUrl");
    expect(body).toMatchObject({ provider: "gemini", requestId: "request-123" });
  });

  it("returns a 422 manual fallback when every provider fails", async () => {
    const recognize = vi.fn().mockRejectedValue(new VisionRecognitionError("timeout", "request-123"));
    const response = await createRecognizeHandler(recognize, () => "request-123")(multipartRequest(
      "/api/recognize",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      manualFallback: true,
      requestId: "request-123",
    });
  });
});

describe("GET /api/recognize/health", () => {
  it("returns 404 in production without running a reachability check", async () => {
    const checkOllama = vi.fn();
    const response = await createRecognitionHealthHandler(
      { NODE_ENV: "production", VISION_PROVIDER: "ollama", GEMINI_API_KEY: "secret" },
      checkOllama,
    )();

    expect(response.status).toBe(404);
    expect(checkOllama).not.toHaveBeenCalled();
  });

  it("returns only non-secret health fields in development", async () => {
    const response = await createRecognitionHealthHandler(
      { NODE_ENV: "development", VISION_PROVIDER: "ollama", GEMINI_API_KEY: "secret" },
      vi.fn().mockResolvedValue(true),
    )();
    const body = await response.json();

    expect(body).toEqual({
      configuredProvider: "ollama",
      ollamaReachable: true,
      geminiConfigured: true,
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
