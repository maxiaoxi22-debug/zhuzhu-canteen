import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { dishes } from "../../src/db/schema";

describe("dish duplicate schema", () => {
  it("has a nullable nameKey column for concurrent saves", () => {
    expect(getTableColumns(dishes).nameKey).toBeDefined();
  });
});
