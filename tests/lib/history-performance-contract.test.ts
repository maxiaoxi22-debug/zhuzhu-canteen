import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("history performance", () => {
  it("loads remote history rows in parallel", () => {
    const source = readFileSync(new URL("../../src/app/api/history/route.ts", import.meta.url), "utf8");
    expect(source).toContain("Promise.all");
  });

  it("prefetches once in Home instead of fetching whenever HistoryPage mounts", () => {
    const home = readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../../src/components/HistoryPage.tsx", import.meta.url), "utf8");
    expect(home).toContain('fetch("/api/history")');
    expect(page).not.toContain('fetch("/api/history")');
  });
});
