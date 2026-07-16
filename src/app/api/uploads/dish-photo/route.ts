import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { db } from "../../../../db";
import { consumeApiRateLimit } from "../../../../lib/api-rate-limit";
import { uploadImage } from "../../../../lib/blob";
import { deleteManagedDishBlob } from "../../../../lib/blob-delete";
import {
  acquirePhotoUploadForCleanup,
  createPhotoUploadReservation,
  finishPhotoUploadCleanup,
  restorePhotoUploadAfterCleanupFailure,
} from "../../../../lib/photo-upload-reservation";
import {
  isSameOriginRequest,
  readRequestBodyBounded,
  requestClientKey,
  RequestBodyTooLargeError,
  requestWithBodyBytes,
} from "../../../../lib/request-security";
import { createUploadCleanupToken, verifyUploadCleanupToken } from "../../../../lib/upload-cleanup-token";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
const MAX_CLEANUP_BODY_BYTES = 4096;
const RESERVATION_TTL_MS = 60 * 60 * 1000;

type UploadImage = (file: File) => Promise<string>;
type DeleteImage = (url: string) => Promise<void>;

interface RateLimiter {
  allow(key: string): boolean | Promise<boolean>;
}

interface ReservationStore {
  create(input: { id: string; imageUrl: string; now: number; expiresAt: number }): Promise<void>;
  acquire(input: { id: string; imageUrl: string; now: number }): Promise<"acquired" | "temp" | "claimed" | "deleting" | "missing">;
  finish(id: string): Promise<void>;
  restore(id: string, now: number): Promise<void>;
}

interface UploadHandlerOptions {
  cleanupSecret?: string;
  limiter?: RateLimiter;
  reservations?: ReservationStore;
  now?: () => number;
  createId?: () => string;
}

const defaultLimiter: RateLimiter = {
  allow: (key) => consumeApiRateLimit(db, key, { limit: 20, windowMs: 60_000 }),
};

const defaultReservations: ReservationStore = {
  create: (input) => createPhotoUploadReservation(db, input),
  acquire: (input) => acquirePhotoUploadForCleanup(db, input),
  finish: (id) => finishPhotoUploadCleanup(db, id),
  restore: (id, now) => restorePhotoUploadAfterCleanupFailure(db, id, now),
};

export function createDishPhotoUploadHandlers(
  upload: UploadImage = uploadImage,
  remove: DeleteImage = deleteManagedDishBlob,
  options: UploadHandlerOptions = {},
) {
  const cleanupSecret = options.cleanupSecret ?? process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const limiter = options.limiter ?? defaultLimiter;
  const reservations = options.reservations ?? defaultReservations;
  const now = options.now ?? Date.now;
  const createId = options.createId ?? randomUUID;

  async function POST(request: Request) {
    try {
      if (!(await limiter.allow(requestClientKey(request, "upload")))) {
        return NextResponse.json({ error: "上传过于频繁，请稍后再试" }, { status: 429 });
      }
    } catch {
      return NextResponse.json({ error: "照片服务暂时不可用" }, { status: 503 });
    }

    let formData: FormData;
    try {
      const body = await readRequestBodyBounded(request, MAX_MULTIPART_BYTES);
      formData = await requestWithBodyBytes(request, body).formData();
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "图片不能超过 10 MB" }, { status: 413 });
      }
      return NextResponse.json({ error: "请上传菜品照片" }, { status: 400 });
    }

    const image = formData.get("image");
    if (!(image instanceof File)) return NextResponse.json({ error: "请上传菜品照片" }, { status: 400 });
    if (!image.type.startsWith("image/")) return NextResponse.json({ error: "仅支持图片文件" }, { status: 415 });
    if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "图片不能超过 10 MB" }, { status: 413 });
    if (!cleanupSecret) return NextResponse.json({ error: "照片服务暂时不可用" }, { status: 503 });

    let imageUrl: string | null = null;
    try {
      imageUrl = await upload(image);
      const photoUploadId = createId();
      const createdAt = now();
      await reservations.create({
        id: photoUploadId,
        imageUrl,
        now: createdAt,
        expiresAt: createdAt + RESERVATION_TTL_MS,
      });
      return NextResponse.json({
        imageUrl,
        photoUploadId,
        cleanupToken: createUploadCleanupToken(photoUploadId, imageUrl, cleanupSecret, createdAt),
      });
    } catch {
      if (imageUrl) await remove(imageUrl).catch(() => undefined);
      console.error("Dish photo upload or reservation failed");
      return NextResponse.json({ error: "照片上传失败，请稍后重试" }, { status: 500 });
    }
  }

  async function DELETE(request: Request) {
    try {
      if (!(await limiter.allow(requestClientKey(request, "cleanup")))) {
        return NextResponse.json({ error: "清理请求过于频繁，请稍后再试" }, { status: 429 });
      }
    } catch {
      return NextResponse.json({ error: "照片清理服务暂时不可用" }, { status: 503 });
    }
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ error: "不允许跨站清理照片" }, { status: 403 });
    }

    let cleanupToken = "";
    try {
      const bytes = await readRequestBodyBounded(request, MAX_CLEANUP_BODY_BYTES);
      const body = JSON.parse(new TextDecoder().decode(bytes)) as { cleanupToken?: unknown };
      if (typeof body.cleanupToken === "string") cleanupToken = body.cleanupToken;
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "清理请求过大" }, { status: 413 });
      }
      return NextResponse.json({ error: "清理请求无效" }, { status: 400 });
    }
    const checkedAt = now();
    const payload = verifyUploadCleanupToken(cleanupToken, cleanupSecret, checkedAt);
    if (!payload) return NextResponse.json({ error: "清理凭证无效或已过期" }, { status: 403 });

    let ownership: Awaited<ReturnType<ReservationStore["acquire"]>>;
    try {
      ownership = await reservations.acquire({
        id: payload.reservationId,
        imageUrl: payload.imageUrl,
        now: checkedAt,
      });
    } catch {
      return NextResponse.json({ error: "照片清理服务暂时不可用" }, { status: 503 });
    }
    if (ownership === "claimed") return NextResponse.json({ error: "已保存照片不能清理" }, { status: 409 });
    if (ownership !== "acquired") return NextResponse.json({ error: "照片正在处理或已清理" }, { status: 409 });

    try {
      await remove(payload.imageUrl);
    } catch {
      await reservations.restore(payload.reservationId, now()).catch(() => undefined);
      console.error("Unassociated dish photo cleanup failed");
      return NextResponse.json({ error: "照片清理失败，请稍后重试" }, { status: 502 });
    }
    try {
      await reservations.finish(payload.reservationId);
      return NextResponse.json({ success: true });
    } catch {
      console.error("Deleted dish photo reservation finalization failed");
      return NextResponse.json({ error: "照片已清理，状态同步稍后重试" }, { status: 502 });
    }
  }

  return { POST, DELETE };
}

export function createDishPhotoUploadHandler(upload: UploadImage = uploadImage, options: UploadHandlerOptions = {}) {
  return createDishPhotoUploadHandlers(upload, deleteManagedDishBlob, options).POST;
}

const handlers = createDishPhotoUploadHandlers();
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
