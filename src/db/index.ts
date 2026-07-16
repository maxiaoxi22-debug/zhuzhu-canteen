import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

export function createDatabase(url: string, authToken?: string) {
  const client = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  });

  return drizzle(client);
}

type Database = ReturnType<typeof createDatabase>;

let defaultDatabase: Database | undefined;

function getDefaultDatabase(): Database {
  if (!defaultDatabase) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error("TURSO_DATABASE_URL is required before using the default database");
    }
    defaultDatabase = createDatabase(url, process.env.TURSO_AUTH_TOKEN);
  }
  return defaultDatabase;
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDefaultDatabase();
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
