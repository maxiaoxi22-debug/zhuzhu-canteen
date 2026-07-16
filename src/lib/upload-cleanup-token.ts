import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface UploadCleanupPayload {
  version: number;
  imageUrl: string;
  expiresAt: number;
  nonce: string;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("zhuzhu-canteen:upload-cleanup:v1:")
    .update(payload)
    .digest();
}

export function createUploadCleanupToken(
  imageUrl: string,
  secret: string,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
): string {
  if (!secret) throw new Error("Upload cleanup secret is not configured");
  const payload: UploadCleanupPayload = {
    version: TOKEN_VERSION,
    imageUrl,
    expiresAt: now + ttlMs,
    nonce: randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function verifyUploadCleanupToken(
  token: string,
  secret: string,
  now = Date.now(),
): UploadCleanupPayload | null {
  if (!secret || typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, suppliedSignature] = parts;
  try {
    const expected = signature(encoded, secret);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<UploadCleanupPayload>;
    if (payload.version !== TOKEN_VERSION
      || typeof payload.imageUrl !== "string"
      || typeof payload.expiresAt !== "number"
      || typeof payload.nonce !== "string"
      || payload.expiresAt < now) return null;
    return payload as UploadCleanupPayload;
  } catch {
    return null;
  }
}
