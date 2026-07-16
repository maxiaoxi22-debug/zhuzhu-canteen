import { config } from "dotenv";
import { pathToFileURL } from "node:url";

import { db } from "../../src/db";
import { deleteManagedDishBlob } from "../../src/lib/blob-delete";
import { sweepExpiredPhotoUploads } from "../../src/lib/photo-upload-reservation";

config({ path: ".env.local" });

export async function runExpiredPhotoUploadSweep() {
  return sweepExpiredPhotoUploads(db, deleteManagedDishBlob);
}

async function main(): Promise<void> {
  const result = await runExpiredPhotoUploadSweep();
  console.log(`Expired photo sweep: acquired=${result.acquired}, deleted=${result.deleted}, failed=${result.failed}`);
  if (result.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Expired photo sweep failed");
    process.exitCode = 1;
  });
}
