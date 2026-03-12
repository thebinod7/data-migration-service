export type LogLevel = "info" | "warn" | "error" | "debug";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) in LOG_LEVEL_ORDER
    ? (process.env.LOG_LEVEL as LogLevel)
    : "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const base = { time: timestamp, level, msg: message };
  const out = meta ? { ...base, ...meta } : base;
  return JSON.stringify(out);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) console.log(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(formatMessage("error", message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) console.log(formatMessage("debug", message, meta));
  },
};
