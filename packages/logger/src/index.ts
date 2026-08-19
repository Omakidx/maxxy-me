export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<
  string,
  boolean | number | string | null | undefined
>;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
const minimumLevel = levelOrder[configuredLevel] ?? levelOrder.info;

export function log(
  level: LogLevel,
  service: string,
  message: string,
  fields: LogFields = {},
) {
  if (levelOrder[level] < minimumLevel) {
    return;
  }

  const entry = {
    level,
    message,
    service,
    releaseVersion: process.env.RELEASE_VERSION ?? "development",
    timestamp: new Date().toISOString(),
    ...fields,
  };

  console[level === "debug" ? "log" : level](JSON.stringify(entry));
}
