import { db } from "@/db";
import { deleteManagedDishBlob } from "@/lib/blob-delete";
import {
  createPhotoUploadSweepCronHandler,
  sweepExpiredPhotoUploads,
} from "@/lib/photo-upload-reservation";

export const GET = createPhotoUploadSweepCronHandler({
  secret: process.env.CRON_SECRET,
  sweep: () => sweepExpiredPhotoUploads(db, deleteManagedDishBlob),
});
