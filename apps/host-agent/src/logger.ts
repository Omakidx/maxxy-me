export function log(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {},
) {
  console[level](
    JSON.stringify({
      level,
      service: "maxxy-host-agent",
      message,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}
