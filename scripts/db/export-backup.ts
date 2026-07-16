import { createClient, type Client, type Transaction } from "@libsql/client";
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

config({ path: ".env.local" });

export interface DatabaseSnapshotTable {
  name: string;
  sql: string;
  rows: Record<string, DatabaseSnapshotValue>[];
}

export type DatabaseSnapshotValue =
  | null
  | string
  | number
  | boolean
  | { $type: "blob"; base64: string }
  | { $type: "bigint"; value: string };

export interface DatabaseSnapshot {
  exportedAt: string;
  tables: DatabaseSnapshotTable[];
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function encodeSnapshotValue(value: unknown): DatabaseSnapshotValue {
  if (value instanceof ArrayBuffer) {
    return { $type: "blob", base64: Buffer.from(value).toString("base64") };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      $type: "blob",
      base64: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64"),
    };
  }
  if (typeof value === "bigint") {
    return { $type: "bigint", value: value.toString() };
  }
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as null | string | number | boolean;
  }
  throw new TypeError(`Unsupported database value in backup: ${typeof value}`);
}

async function rowOrderClause(executor: Pick<Transaction, "execute">, tableName: string): Promise<string> {
  const columns = await executor.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  const orderedColumns = [...columns.rows]
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .filter((column) => Number(column.pk) > 0)
    .map((column) => String(column.name));

  const fallbackColumns = columns.rows.map((column) => String(column.name));
  const names = orderedColumns.length > 0 ? orderedColumns : fallbackColumns;
  return names.length > 0 ? ` ORDER BY ${names.map(quoteIdentifier).join(", ")}` : "";
}

type SnapshotExecutor = Pick<Transaction, "execute">;

async function readDatabaseSnapshot(executor: SnapshotExecutor): Promise<DatabaseSnapshot> {
  const tableResult = await executor.execute(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT GLOB 'sqlite_*'
      AND name NOT GLOB 'libsql_*'
      AND name NOT GLOB '_libsql_*'
      AND name NOT GLOB '_litestream_*'
    ORDER BY name
  `);

  const tables: DatabaseSnapshotTable[] = [];
  for (const table of tableResult.rows) {
    const name = String(table.name);
    const sql = String(table.sql);
    const orderClause = await rowOrderClause(executor, name);
    const result = await executor.execute(`SELECT * FROM ${quoteIdentifier(name)}${orderClause}`);
    const rows = result.rows.map((row) => Object.fromEntries(
      Object.entries(row).map(([column, value]) => [column, encodeSnapshotValue(value)]),
    ));
    tables.push({ name, sql, rows });
  }

  return {
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export async function exportDatabaseSnapshot(
  client: Client,
  outputPath: string,
): Promise<DatabaseSnapshot> {
  let snapshot: DatabaseSnapshot;
  if (client.protocol === "file") {
    await client.execute("BEGIN");
    try {
      snapshot = await readDatabaseSnapshot(client);
      await client.execute("COMMIT");
    } catch (error) {
      await client.execute("ROLLBACK");
      throw error;
    }
  } else {
    const transaction = await client.transaction("read");
    try {
      snapshot = await readDatabaseSnapshot(transaction);
      await transaction.commit();
    } finally {
      transaction.close();
    }
  }
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return snapshot;
}

async function main(): Promise<void> {
  const outputFlagIndex = process.argv.indexOf("--output");
  const outputPath = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : undefined;
  if (!outputPath || outputPath.startsWith("--")) {
    throw new Error("Usage: npm run db:backup -- --output <path>");
  }

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required");
  }

  const client = createClient({
    url,
    intMode: "bigint",
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  });
  try {
    await exportDatabaseSnapshot(client, outputPath);
    console.log(`Database backup written to ${outputPath}`);
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Database backup failed");
    process.exitCode = 1;
  });
}
