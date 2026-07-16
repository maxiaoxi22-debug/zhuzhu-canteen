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
  return new Request(`http://local.test${path}`, {
    method: "POST",
    headers: { origin: "http://local.test", "x-forwarded-for": "1.2.3.4" },
    body: formData,
  });
}

function reservationStore(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    acquire: vi.fn().mockResolvedValue("acquired"),
    finish: vi.fn().mockResolvedValue(true),
    restore: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const allowed = { allow: vi.fn().mockResolvedValue(true) };

describe("POST /api/uploads/dish-photo", () => {
  it("returns a stable URL and a signed cleanup token bound to that exact upload", async () => {
    const upload = vi.fn().mockResolvedValue("https://blob.test/dish.jpg");
    const reservations = reservationStore();
    const response = await createDishPhotoUploadHandler(upload, {
      cleanupSecret: "test-secret", limiter: allowed, reservations, createId: () => "upload-1",
    })(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1, 2])], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      imageUrl: "https://blob.test/dish.jpg", photoUploadId: "upload-1", cleanupToken: expect.any(String),
    });
    expect(verifyUploadCleanupToken(body.cleanupToken, "test-secret")).toMatchObject({
      reservationId: "upload-1",
      imageUrl: "https://blob.test/dish.jpg",
    });
    expect(reservations.create).toHaveBeenCalledWith(expect.objectContaining({
      id: "upload-1", imageUrl: "https://blob.test/dish.jpg",
    }));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("rejects non-images and images over 10 MB before upload", async () => {
    const upload = vi.fn();
    const options = { cleanupSecret: "test-secret", limiter: allowed, reservations: reservationStore() };
    const wrongType = await createDishPhotoUploadHandler(upload, options)(multipartRequest(
      "/api/uploads/dish-photo",
      new File(["text"], "dish.txt", { type: "text/plain" }),
    ));
    const tooLarge = await createDishPhotoUploadHandler(upload, options)(multipartRequest(
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
      limiter: { allow: vi.fn().mockResolvedValue(false) },
      reservations: reservationStore(),
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
        limiter: { allow: vi.fn().mockResolvedValue(true) },
        reservations: reservationStore(),
        createId: () => "upload-exact",
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
        limiter: { allow: vi.fn().mockResolvedValue(true) },
        reservations: reservationStore({ acquire: vi.fn().mockResolvedValue("claimed") }),
        createId: () => "upload-saved",
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
      limiter: { allow: vi.fn().mockResolvedValue(false) },
      reservations: reservationStore(),
    });
    const limited = await limitedHandlers.DELETE(deleteRequest(token));

    expect(oversized.status).toBe(413);
    expect(limited.status).toBe(429);
    expect(remove).not.toHaveBeenCalled();
  });

  it("restores a deleting reservation when Blob deletion fails", async () => {
    const reservations = reservationStore();
    const handlers = createDishPhotoUploadHandlers(
      vi.fn().mockResolvedValue("https://blob.test/retry.jpg"),
      vi.fn().mockRejectedValue(new Error("blob unavailable")),
      {
        cleanupSecret: "test-secret",
        limiter: { allow: vi.fn().mockResolvedValue(true) },
        reservations,
        createId: () => "upload-retry",
      },
    );
    const uploadResponse = await handlers.POST(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));
    const token = (await uploadResponse.json()).cleanupToken as string;

    const response = await handlers.DELETE(deleteRequest(token));

    expect(response.status).toBe(502);
    expect(reservations.restore).toHaveBeenCalledWith(
      "upload-retry",
      expect.any(Number),
      expect.any(Number),
    );
    expect(reservations.finish).not.toHaveBeenCalled();
  });

  it("keeps the reservation deleting when Blob deletion succeeds but finalization fails", async () => {
    const reservations = reservationStore({ finish: vi.fn().mockRejectedValue(new Error("database unavailable")) });
    const handlers = createDishPhotoUploadHandlers(
      vi.fn().mockResolvedValue("https://blob.test/deleted.jpg"),
      vi.fn().mockResolvedValue(undefined),
      {
        cleanupSecret: "test-secret",
        limiter: { allow: vi.fn().mockResolvedValue(true) },
        reservations,
        createId: () => "upload-deleted",
      },
    );
    const uploadResponse = await handlers.POST(multipartRequest(
      "/api/uploads/dish-photo",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));
    const token = (await uploadResponse.json()).cleanupToken as string;

    const response = await handlers.DELETE(deleteRequest(token));

    expect(response.status).toBe(502);
    expect(reservations.restore).not.toHaveBeenCalled();
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
    const response = await createRecognizeHandler(recognize, () => "request-123", { limiter: allowed })(multipartRequest(
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
    const response = await createRecognizeHandler(recognize, () => "request-123", { limiter: allowed })(multipartRequest(
      "/api/recognize",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      manualFallback: true,
      requestId: "request-123",
    });
  });

  it("rejects cross-origin and database-rate-limited recognition before calling a model", async () => {
    const recognize = vi.fn();
    const crossOriginRequest = multipartRequest(
      "/api/recognize",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    );
    crossOriginRequest.headers.set("origin", "https://evil.test");
    const crossOrigin = await createRecognizeHandler(recognize, () => "cross-origin", {
      limiter: { allow: vi.fn().mockResolvedValue(true) },
    })(crossOriginRequest);
    const limited = await createRecognizeHandler(recognize, () => "limited", {
      limiter: { allow: vi.fn().mockResolvedValue(false) },
    })(multipartRequest(
      "/api/recognize",
      new File([new Uint8Array([1])], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(crossOrigin.status).toBe(403);
    expect(limited.status).toBe(429);
    expect(recognize).not.toHaveBeenCalled();
  });

  it("rejects an oversized image through bounded multipart parsing", async () => {
    const recognize = vi.fn();
    const response = await createRecognizeHandler(recognize, () => "too-large", {
      limiter: { allow: vi.fn().mockResolvedValue(true) },
    })(multipartRequest(
      "/api/recognize",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "dish.jpg", { type: "image/jpeg" }),
    ));

    expect(response.status).toBe(413);
    expect(recognize).not.toHaveBeenCalled();
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
