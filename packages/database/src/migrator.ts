import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

export type MigrationResult = {
  id: string;
  checksum: string;
  applied: boolean;
};

export type MigrationOptions = {
  databaseUrl: string;
  migrationsDir?: string;
  releaseVersion?: string;
};

export async function runMigrations(options: MigrationOptions) {
  const migrationsDir =
    options.migrationsDir ??
    join(process.cwd(), "packages/database/migrations");
  const sql = postgres(options.databaseUrl, { max: 1 });

  try {
    await sql`create table if not exists schema_migrations (
      id text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`;

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const results: MigrationResult[] = [];

    for (const file of files) {
      const id = file;
      const body = await readFile(join(migrationsDir, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex");
      const [existing] = await sql<
        { checksum: string }[]
      >`select checksum from schema_migrations where id = ${id}`;

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${id}`);
        }
        results.push({ id, checksum, applied: false });
        continue;
      }

      await sql.begin(async (tx) => {
        await tx`select set_config('maxxy.release_version', ${options.releaseVersion ?? "development"}, true)`;
        await tx.unsafe(body);
        await tx`insert into schema_migrations (id, checksum) values (${id}, ${checksum})`;
      });

      results.push({ id, checksum, applied: true });
    }

    return results;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
