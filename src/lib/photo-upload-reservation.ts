import { and, eq, gte } from "drizzle-orm";

import type { createDatabase } from "../db";
import { dishPhotoUploads } from "../db/schema";

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
  return database.transaction(async (transaction) => {
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
  });
}

export async function finishPhotoUploadCleanup(database: PhotoUploadDatabase, id: string): Promise<void> {
  await database.delete(dishPhotoUploads).where(and(
    eq(dishPhotoUploads.id, id),
    eq(dishPhotoUploads.status, "deleting"),
  ));
}

export async function restorePhotoUploadAfterCleanupFailure(
  database: PhotoUploadDatabase,
  id: string,
  now = Date.now(),
): Promise<void> {
  await database
    .update(dishPhotoUploads)
    .set({ status: "temp", updatedAt: new Date(now).toISOString() })
    .where(and(eq(dishPhotoUploads.id, id), eq(dishPhotoUploads.status, "deleting")));
}
