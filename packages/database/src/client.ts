import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createSqlClient(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export function createDatabase(databaseUrl: string) {
  const sql = createSqlClient(databaseUrl);
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;
export type Database = DatabaseHandle["db"];
