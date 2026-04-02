type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

type LogEntry = {
  component: string;
  context: LogContext;
  level: LogLevel;
  message: string;
  ts: string;
};

type LogMethod = (message: string, context?: LogContext) => LogEntry;

type ScopedLogger = {
  debug: LogMethod;
  error: LogMethod;
  info: LogMethod;
  warn: LogMethod;
};

type LoggerLike = {
  error: (message: string, context?: LogContext) => unknown;
  info: (message: string, context?: LogContext) => unknown;
};

function shouldWriteLog(level: LogLevel): boolean {
  return !(level === "debug" && process.env.NODE_ENV === "production");
}

function getWriter(level: LogLevel) {
  return level === "debug"
    ? console.debug
    : level === "info"
      ? console.info
      : level === "warn"
        ? console.warn
        : console.error;
}

function serializeContext(context: LogContext): string | null {
  if (Object.keys(context).length === 0) {
    return null;
  }

  try {
    return JSON.stringify(context, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
  } catch (error) {
    return JSON.stringify({
      contextKeys: Object.keys(context),
      error: error instanceof Error ? error.message : "Unknown log serialization error",
    });
  }
}

function formatLogLine(entry: LogEntry): string {
  const prefix = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.component}] ${entry.message}`;
  const serializedContext = serializeContext(entry.context);
  return serializedContext ? `${prefix} ${serializedContext}` : prefix;
}

function writeLog(component: string, level: LogLevel, message: string, context: LogContext = {}): LogEntry {
  const entry: LogEntry = {
    component,
    context,
    level,
    message,
    ts: new Date().toISOString(),
  };

  if (!shouldWriteLog(level)) {
    return entry;
  }

  getWriter(level)(formatLogLine(entry));
  return entry;
}

function createLogger(component: string): ScopedLogger {
  return {
    debug(message: string, context?: LogContext) {
      return writeLog(component, "debug", message, context);
    },
    error(message: string, context?: LogContext) {
      return writeLog(component, "error", message, context);
    },
    info(message: string, context?: LogContext) {
      return writeLog(component, "info", message, context);
    },
    warn(message: string, context?: LogContext) {
      return writeLog(component, "warn", message, context);
    },
  };
}

const logger = createLogger("App");

export type { LogContext, LogEntry, LoggerLike, LogLevel, ScopedLogger };
export { createLogger, logger };
