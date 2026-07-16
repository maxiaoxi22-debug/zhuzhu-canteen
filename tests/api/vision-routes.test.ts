import { describe, expect, it, vi } from "vitest";
import {
  createDishPhotoUploadHandler,
  createDishPhotoUploadHandlers,
} from "../../src/app/api/uploads/dish-photo/route";
import { verifyUploadCleanupToken } from "../../src/lib/upload-cleanup-token";
import { createRecognizeHandler } from "../../src/app/api/recognize/route";
import { createRecognitionHealthHandler } from "../../src/app/api/recognize/health/route";
import { VisionRecognitionError } from "../../src/lib/vision";

function multipartRequest(path: string, file?: File): Request {
  const formData = new FormData();
  if (file) formData.append("image", file);
  return new Request(`http://local.test${path}`, { method: "POST", body: formData });
}

describe("POST /api/uploads/dish-photo", () => {
  it("returns a stable URL and a signed cleanup token bound to that exact upload", async () => {
    const upload = vi.fn().mockResolvedValue("https://blob.test/dish.jpg");
    const response = await createDishPhotoUploadHandler(upload, { cleanupSecret: "test-secret" })(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1, 2])], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ imageUrl: "https://blob.test/dish.jpg", cleanupToken: expect.any(String) });
    expect(verifyUploadCleanupToken(body.cleanupToken, "test-secret")).toMatchObject({
      imageUrl: "https://blob.test/dish.jpg",
    });
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

  it("rate limits uploads before accepting another image", async () => {
    const upload = vi.fn();
    const POST = createDishPhotoUploadHandler(upload, {
      cleanupSecret: "test-secret",
      limiter: { allow: vi.fn().mockReturnValue(false) },
    });
    const response = await POST(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(response.status).toBe(429);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/uploads/dish-photo", () => {
  function deleteRequest(token: string, origin = "http://local.test", body?: string): Request {
    return new Request("http://local.test/api/uploads/dish-photo", {
      method: "DELETE",
      headers: { "content-type": "application/json", origin },
      body: body ?? JSON.stringify({ cleanupToken: token }),
    });
  }

  async function uploadedHandlers() {
    const remove = vi.fn().mockResolvedValue(undefined);
    const handlers = createDishPhotoUploadHandlers(
      vi.fn().mockResolvedValue("https://blob.test/exact.jpg"),
      remove,
      {
        cleanupSecret: "test-secret",
        limiter: { allow: vi.fn().mockReturnValue(true) },
        isImageAssociated: vi.fn().mockResolvedValue(false),
      },
    );
    const uploadResponse = await handlers.POST(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));
    return { handlers, remove, token: (await uploadResponse.json()).cleanupToken as string };
  }

  it("deletes only the exact Blob encoded in a valid same-origin upload token", async () => {
    const { handlers, remove, token } = await uploadedHandlers();
    const response = await handlers.DELETE(deleteRequest(token));

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith("https://blob.test/exact.jpg");
  });

  it("refuses cleanup after the exact uploaded photo has been associated with a saved dish", async () => {
    const remove = vi.fn();
    const handlers = createDishPhotoUploadHandlers(
      vi.fn().mockResolvedValue("https://blob.test/saved.jpg"),
      remove,
      {
        cleanupSecret: "test-secret",
        limiter: { allow: vi.fn().mockReturnValue(true) },
        isImageAssociated: vi.fn().mockResolvedValue(true),
      },
    );
    const uploaded = await handlers.POST(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));
    const token = (await uploaded.json()).cleanupToken as string;

    const response = await handlers.DELETE(deleteRequest(token));

    expect(response.status).toBe(409);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects tampered tokens and cross-origin requests without deleting", async () => {
    const { handlers, remove, token } = await uploadedHandlers();
    const tampered = await handlers.DELETE(deleteRequest(`${token}x`));
    const crossOrigin = await handlers.DELETE(deleteRequest(token, "https://evil.test"));

    expect(tampered.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects oversized cleanup bodies and rate-limited requests", async () => {
    const { handlers, remove, token } = await uploadedHandlers();
    const oversized = await handlers.DELETE(deleteRequest(token, "http://local.test", "x".repeat(4097)));
    const limitedHandlers = createDishPhotoUploadHandlers(vi.fn(), remove, {
      cleanupSecret: "test-secret",
      limiter: { allow: vi.fn().mockReturnValue(false) },
      isImageAssociated: vi.fn().mockResolvedValue(false),
    });
    const limited = await limitedHandlers.DELETE(deleteRequest(token));

    expect(oversized.status).toBe(413);
    expect(limited.status).toBe(429);
    expect(remove).not.toHaveBeenCalled();
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
