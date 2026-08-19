console.log(
  JSON.stringify({
    level: "info",
    service: "maxxy-db-generate",
    message:
      "Drizzle schema is source-controlled in packages/database/src/schema.ts; run drizzle-kit manually when intentionally authoring a generated migration.",
    schema: "packages/database/src/schema.ts",
    migrations: "packages/database/migrations",
    timestamp: new Date().toISOString(),
  }),
);

export {};
