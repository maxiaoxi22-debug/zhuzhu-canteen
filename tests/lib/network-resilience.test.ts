import { describe, expect, it } from "vitest";
import { withRetry } from "../../src/lib/network-resilience";

describe("network resilience", () => {
  it("retries a transient failure once", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary");
      return "ok";
    }, 2);
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("rethrows after the configured attempts", async () => {
    await expect(withRetry(async () => { throw new Error("offline"); }, 2)).rejects.toThrow("offline");
  });
});
