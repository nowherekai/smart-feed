type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

type LogEntry = LogContext & {
  level: LogLevel;
  message: string;
  ts: string;
};

function writeLog(level: LogLevel, message: string, context: LogContext = {}): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    ts: new Date().toISOString(),
    ...context,
  };
  const writer =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;

  writer(JSON.stringify(entry));

  return entry;
}

export const logger = {
  debug(message: string, context?: LogContext) {
    return writeLog("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    return writeLog("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    return writeLog("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    return writeLog("error", message, context);
  },
};

export type { LogContext, LogEntry, LogLevel };
