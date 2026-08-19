const required = ["DATABASE_URL", "APP_ENV", "RELEASE_VERSION"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "maxxy-release",
      message: "release environment is incomplete",
      missing,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    level: "info",
    service: "maxxy-release",
    message: "running database migrations",
    releaseVersion: process.env.RELEASE_VERSION,
    timestamp: new Date().toISOString(),
  }),
);

const migration = Bun.spawn(["bun", "run", "db:migrate"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

const exitCode = await migration.exited;
process.exit(exitCode);

export {};
