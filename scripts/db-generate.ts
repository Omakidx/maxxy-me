console.log(
  JSON.stringify({
    level: "info",
    service: "maxxy-db-generate",
    message: "Drizzle schema generation is not active until Phase 2",
    timestamp: new Date().toISOString(),
  }),
);

export {};
