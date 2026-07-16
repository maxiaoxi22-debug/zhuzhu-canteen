import { eq, lte } from "drizzle-orm";

import type { createDatabase } from "../db";
import { apiRateLimits } from "../db/schema";
import { withDatabaseBusyRetry } from "./database-retry";

type RateLimitDatabase = ReturnType<typeof createDatabase>;

export async function consumeApiRateLimit(
  database: RateLimitDatabase,
  key: string,
  options: { limit: number; windowMs: number; now?: number },
): Promise<boolean> {
  const now = options.now ?? Date.now();
  return withDatabaseBusyRetry(() => database.transaction(async (transaction) => {
    await transaction.delete(apiRateLimits).where(lte(apiRateLimits.expiresAt, now));
    const [current] = await transaction
      .select()
      .from(apiRateLimits)
      .where(eq(apiRateLimits.key, key))
      .limit(1);
    if (!current) {
      await transaction.insert(apiRateLimits).values({
        key,
        windowStartedAt: now,
        count: 1,
        expiresAt: now + options.windowMs,
      });
      return true;
    }
    if (current.count >= options.limit) return false;
    await transaction
      .update(apiRateLimits)
      .set({ count: current.count + 1 })
      .where(eq(apiRateLimits.key, key));
    return true;
  }));
}
