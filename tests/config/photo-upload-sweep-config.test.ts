import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("expired photo sweep operations", () => {
  it("configures a daily Vercel cron that calls the protected route", async () => {
    const config = JSON.parse(await readFile(`${root}/vercel.json`, "utf8")) as {
      crons?: { path?: string; schedule?: string }[];
    };
    expect(config.crons).toContainEqual({ path: "/api/cron/photo-uploads", schedule: "0 3 * * *" });

    const route = await readFile(`${root}/src/app/api/cron/photo-uploads/route.ts`, "utf8");
    expect(route).toContain("createPhotoUploadSweepCronHandler");
    expect(route).toContain("sweepExpiredPhotoUploads");
    expect(route).toContain("deleteManagedDishBlob");
    expect(route).toContain("process.env.CRON_SECRET");
  });

  it("provides a manual npm command that calls the same sweep service", async () => {
    const packageJson = JSON.parse(await readFile(`${root}/package.json`, "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["uploads:sweep"]).toBe("tsx scripts/uploads/sweep-expired.ts");
    const script = await readFile(`${root}/scripts/uploads/sweep-expired.ts`, "utf8");
    expect(script).toContain("sweepExpiredPhotoUploads");
    expect(script).toContain("deleteManagedDishBlob");
  });

  it("documents CRON_SECRET, manual recovery, and the intentionally deferred limitations", async () => {
    const envExample = await readFile(`${root}/.env.example`, "utf8");
    const readme = await readFile(`${root}/README.md`, "utf8");
    expect(envExample).toContain("CRON_SECRET=");
    expect(readme).toContain("CRON_SECRET");
    expect(readme).toContain("npm run uploads:sweep");
    expect(readme).toContain("编辑菜品更换照片后，旧 Blob");
    expect(readme).toContain("远程 Turso");
  });
});
