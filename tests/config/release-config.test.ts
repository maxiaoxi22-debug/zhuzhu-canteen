import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
  scripts: Record<string, string>;
};
const envExample = readFileSync(".env.example", "utf8");
const readme = readFileSync("README.md", "utf8");

describe("release configuration", () => {
  it("keeps the package version aligned with the patch release", () => {
    expect(packageJson.version).toBe("0.3.1");
  });

  it("runs isolated handler tests instead of a permanently failing API script", () => {
    expect(packageJson.scripts["test:api"]).toContain("recipe-handlers.test.ts");
    expect(packageJson.scripts["test:api"]).toContain("vision-routes.test.ts");
    expect(packageJson.scripts["test:api"]).toContain("wishlist-handlers.test.ts");
    expect(packageJson.scripts["test:api"]).not.toContain("process.exit(1)");
  });

  it("documents every required production service variable", () => {
    for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "BLOB_READ_WRITE_TOKEN", "GEMINI_API_KEY"]) {
      expect(envExample).toContain(`${name}=`);
      expect(readme).toContain(name);
    }
  });
});
