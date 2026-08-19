import { type LogFields, type LogLevel, log as writeLog } from "@maxxy/logger";

export function log(level: LogLevel, message: string, fields: LogFields = {}) {
  writeLog(level, process.env.APP_NAME ?? "maxxy-me", message, fields);
}
