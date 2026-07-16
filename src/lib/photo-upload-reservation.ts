import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, gte, lt, lte, or } from "drizzle-orm";

import type { createDatabase } from "../db";
import { dishPhotoUploads } from "../db/schema";
import { withDatabaseBusyRetry } from "./database-retry";

export type PhotoUploadDatabase = ReturnType<typeof createDatabase>;
type PhotoUploadTransaction = Parameters<Parameters<PhotoUploadDatabase["transaction"]>[0]>[0];

interface ReservationIdentity {
  id: string;
  imageUrl: string;
}

export async function createPhotoUploadReservation(
  database: PhotoUploadDatabase,
  input: ReservationIdentity & { now: number; expiresAt: number },
): Promise<void> {
  const timestamp = new Date(input.now).toISOString();
  await database.insert(dishPhotoUploads).values({
    id: input.id,
    imageUrl: input.imageUrl,
    status: "temp",
    claimedDishId: null,
    expiresAt: input.expiresAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function claimPhotoUpload(
  transaction: PhotoUploadTransaction,
  input: ReservationIdentity & { dishId: string; now: number },
): Promise<boolean> {
  const claimed = await transaction
    .update(dishPhotoUploads)
    .set({ status: "claimed", claimedDishId: input.dishId, updatedAt: new Date(input.now).toISOString() })
    .where(and(
      eq(dishPhotoUploads.id, input.id),
      eq(dishPhotoUploads.imageUrl, input.imageUrl),
      eq(dishPhotoUploads.status, "temp"),
      gte(dishPhotoUploads.expiresAt, input.now),
    ))
    .returning({ id: dishPhotoUploads.id });
  return claimed.length === 1;
}

export async function acquirePhotoUploadForCleanup(
  database: PhotoUploadDatabase,
  input: ReservationIdentity & { now: number },
): Promise<"acquired" | "temp" | "claimed" | "deleting" | "missing"> {
  return withDatabaseBusyRetry(() => database.transaction(async (transaction) => {
    const acquired = await transaction
      .update(dishPhotoUploads)
      .set({ status: "deleting", updatedAt: new Date(input.now).toISOString() })
      .where(and(
        eq(dishPhotoUploads.id, input.id),
        eq(dishPhotoUploads.imageUrl, input.imageUrl),
        eq(dishPhotoUploads.status, "temp"),
        gte(dishPhotoUploads.expiresAt, input.now),
      ))
      .returning({ id: dishPhotoUploads.id });
    if (acquired.length === 1) return "acquired";
    const [reservation] = await transaction
      .select({ status: dishPhotoUploads.status })
      .from(dishPhotoUploads)
      .where(and(eq(dishPhotoUploads.id, input.id), eq(dishPhotoUploads.imageUrl, input.imageUrl)))
      .limit(1);
    return reservation?.status ?? "missing";
  }));
}

export async function finishPhotoUploadCleanup(
  database: PhotoUploadDatabase,
  id: string,
  leaseAcquiredAt: number,
): Promise<boolean> {
  const deleted = await database.delete(dishPhotoUploads).where(and(
    eq(dishPhotoUploads.id, id),
    eq(dishPhotoUploads.status, "deleting"),
    eq(dishPhotoUploads.updatedAt, new Date(leaseAcquiredAt).toISOString()),
  )).returning({ id: dishPhotoUploads.id });
  return deleted.length === 1;
}

export async function restorePhotoUploadAfterCleanupFailure(
  database: PhotoUploadDatabase,
  id: string,
  leaseAcquiredAt: number,
  now = Date.now(),
): Promise<boolean> {
  const restored = await database
    .update(dishPhotoUploads)
    .set({ status: "temp", updatedAt: new Date(now).toISOString() })
    .where(and(
      eq(dishPhotoUploads.id, id),
      eq(dishPhotoUploads.status, "deleting"),
      eq(dishPhotoUploads.updatedAt, new Date(leaseAcquiredAt).toISOString()),
    ))
    .returning({ id: dishPhotoUploads.id });
  return restored.length === 1;
}

export interface PhotoUploadSweepResult {
  acquired: number;
  deleted: number;
  failed: number;
}

export async function sweepExpiredPhotoUploads(
  database: PhotoUploadDatabase,
  remove: (url: string) => Promise<void>,
  options: { now?: number; batchSize?: number; staleDeletingMs?: number } = {},
): Promise<PhotoUploadSweepResult> {
  const now = options.now ?? Date.now();
  const batchSize = Math.max(1, Math.min(100, options.batchSize ?? 25));
  const staleDeletingMs = Math.max(1, options.staleDeletingMs ?? 30 * 60_000);
  const updatedAt = new Date(now).toISOString();
  const staleBefore = new Date(now - staleDeletingMs).toISOString();

  const acquired = await withDatabaseBusyRetry(() => database.transaction(async (transaction) => {
    const candidates = await transaction
      .select({
        id: dishPhotoUploads.id,
        imageUrl: dishPhotoUploads.imageUrl,
        status: dishPhotoUploads.status,
        previousUpdatedAt: dishPhotoUploads.updatedAt,
      })
      .from(dishPhotoUploads)
      .where(or(
        and(eq(dishPhotoUploads.status, "temp"), lt(dishPhotoUploads.expiresAt, now)),
        and(eq(dishPhotoUploads.status, "deleting"), lte(dishPhotoUploads.updatedAt, staleBefore)),
      ))
      .orderBy(asc(dishPhotoUploads.expiresAt))
      .limit(batchSize);

    const owned: { id: string; imageUrl: string }[] = [];
    for (const candidate of candidates) {
      const stateGuard = candidate.status === "temp"
        ? and(eq(dishPhotoUploads.status, "temp"), lt(dishPhotoUploads.expiresAt, now))
        : and(
          eq(dishPhotoUploads.status, "deleting"),
          eq(dishPhotoUploads.updatedAt, candidate.previousUpdatedAt),
          lte(dishPhotoUploads.updatedAt, staleBefore),
        );
      const rows = await transaction
        .update(dishPhotoUploads)
        .set({ status: "deleting", updatedAt })
        .where(and(
          eq(dishPhotoUploads.id, candidate.id),
          eq(dishPhotoUploads.imageUrl, candidate.imageUrl),
          stateGuard,
        ))
        .returning({ id: dishPhotoUploads.id });
      if (rows.length === 1) owned.push({ id: candidate.id, imageUrl: candidate.imageUrl });
    }
    return owned;
  }));

  let deleted = 0;
  let failed = 0;
  for (const reservation of acquired) {
    try {
      await remove(reservation.imageUrl);
      if (await finishPhotoUploadCleanup(database, reservation.id, now)) deleted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { acquired: acquired.length, deleted, failed };
}

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createPhotoUploadSweepCronHandler(options: {
  secret?: string;
  sweep: () => Promise<PhotoUploadSweepResult>;
}) {
  return async function photoUploadSweepCronHandler(request: Request): Promise<Response> {
    if (!options.secret) {
      return Response.json({ error: "定时清理服务未配置" }, { status: 503 });
    }
    if (!bearerMatches(request.headers.get("authorization"), options.secret)) {
      return Response.json({ error: "未授权" }, { status: 401 });
    }
    try {
      return Response.json(await options.sweep());
    } catch {
      return Response.json({ error: "定时清理失败" }, { status: 500 });
    }
  };
}
