import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { dishes } from "../../../../db/schema";
import { uploadImage } from "../../../../lib/blob";
import { deleteManagedDishBlob } from "../../../../lib/blob-delete";
import { createUploadCleanupToken, verifyUploadCleanupToken } from "../../../../lib/upload-cleanup-token";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CLEANUP_BODY_BYTES = 4096;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

type UploadImage = (file: File) => Promise<string>;
type DeleteImage = (url: string) => Promise<void>;

interface RateLimiter {
  allow(key: string): boolean;
}

interface UploadHandlerOptions {
  cleanupSecret?: string;
  limiter?: RateLimiter;
  now?: () => number;
  isImageAssociated?: (url: string) => Promise<boolean>;
}

class FixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  allow(key: string): boolean {
    const now = Date.now();
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
      this.windows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;
    current.count += 1;
    return true;
  }
}

const defaultLimiter = new FixedWindowRateLimiter();

function clientKey(request: Request, action: "upload" | "cleanup"): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${action}:${forwarded || request.headers.get("x-real-ip") || "unknown"}`;
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

async function isImageAssociatedWithDish(url: string): Promise<boolean> {
  const rows = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.imageUrl, url)).limit(1);
  return rows.length > 0;
}

export function createDishPhotoUploadHandlers(
  upload: UploadImage = uploadImage,
  remove: DeleteImage = deleteManagedDishBlob,
  options: UploadHandlerOptions = {},
) {
  const cleanupSecret = options.cleanupSecret ?? process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const limiter = options.limiter ?? defaultLimiter;
  const now = options.now ?? Date.now;
  const isImageAssociated = options.isImageAssociated ?? isImageAssociatedWithDish;

  async function POST(request: Request) {
    if (!limiter.allow(clientKey(request, "upload"))) {
      return NextResponse.json({ error: "上传过于频繁，请稍后再试" }, { status: 429 });
    }
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "请上传菜品照片" }, { status: 400 });
    }

    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "请上传菜品照片" }, { status: 400 });
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "仅支持图片文件" }, { status: 415 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "图片不能超过 10 MB" }, { status: 413 });
    }
    if (!cleanupSecret) {
      return NextResponse.json({ error: "照片服务暂时不可用" }, { status: 503 });
    }

    try {
      const imageUrl = await upload(image);
      return NextResponse.json({
        imageUrl,
        cleanupToken: createUploadCleanupToken(imageUrl, cleanupSecret, now()),
      });
    } catch {
      console.error("Dish photo upload failed");
      return NextResponse.json({ error: "照片上传失败，请稍后重试" }, { status: 500 });
    }
  }

  async function DELETE(request: Request) {
    if (!limiter.allow(clientKey(request, "cleanup"))) {
      return NextResponse.json({ error: "清理请求过于频繁，请稍后再试" }, { status: 429 });
    }
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: "不允许跨站清理照片" }, { status: 403 });
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_CLEANUP_BODY_BYTES) {
      return NextResponse.json({ error: "清理请求过大" }, { status: 413 });
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_CLEANUP_BODY_BYTES) {
      return NextResponse.json({ error: "清理请求过大" }, { status: 413 });
    }
    let cleanupToken = "";
    try {
      const body = JSON.parse(rawBody) as { cleanupToken?: unknown };
      if (typeof body.cleanupToken === "string") cleanupToken = body.cleanupToken;
    } catch {
      return NextResponse.json({ error: "清理请求无效" }, { status: 400 });
    }
    const payload = verifyUploadCleanupToken(cleanupToken, cleanupSecret, now());
    if (!payload) {
      return NextResponse.json({ error: "清理凭证无效或已过期" }, { status: 403 });
    }
    try {
      if (await isImageAssociated(payload.imageUrl)) {
        return NextResponse.json({ error: "已保存照片不能清理" }, { status: 409 });
      }
      await remove(payload.imageUrl);
      return NextResponse.json({ success: true });
    } catch {
      console.error("Dish photo association check or cleanup failed");
      return NextResponse.json({ error: "照片清理失败，请稍后重试" }, { status: 502 });
    }
  }

  return { POST, DELETE };
}

export function createDishPhotoUploadHandler(
  upload: UploadImage = uploadImage,
  options: UploadHandlerOptions = {},
) {
  return createDishPhotoUploadHandlers(upload, deleteManagedDishBlob, options).POST;
}

const handlers = createDishPhotoUploadHandlers();
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
