type AppEnv = {
  timeZone: string;
  timeWindowHours: number;
  digestTimeZone: string;
  digestSendHour: number;
  digestMaxLookbackHours: number;
  valueScoreThreshold: number;
  aiProvider: AiProvider | null;
  openRouterApiKey: string | null;
  openRouterBaseUrl: string;
  aiBasicModel: string | null;
  aiHeavyModel: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  smtpTo: string | null;
};

type AiProvider = "dummy" | "openrouter";

const DEFAULT_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_TIME_WINDOW_HOURS = 72;
const DEFAULT_DIGEST_SEND_HOUR = 8;
const DEFAULT_DIGEST_MAX_LOOKBACK_HOURS = 48;
const DEFAULT_VALUE_SCORE_THRESHOLD = 6;
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const APP_ENV_KEYS = [
  "SMART_FEED_TIMEZONE",
  "SMART_FEED_TIME_WINDOW_HOURS",
  "SMART_FEED_DIGEST_TIMEZONE",
  "SMART_FEED_DIGEST_SEND_HOUR",
  "SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS",
  "SMART_FEED_VALUE_SCORE_THRESHOLD",
  "SMART_FEED_AI_PROVIDER",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "SMART_FEED_AI_BASIC_MODEL",
  "SMART_FEED_AI_HEAVY_MODEL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_TO",
] as const;

let cachedAppEnv: Readonly<AppEnv> | null = null;
let cachedAppEnvSignature: string | null = null;

function parseOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseOptionalAiProvider(value: string | undefined): AiProvider | null {
  const normalized = parseOptionalString(value);

  if (normalized === null) {
    return null;
  }

  if (normalized === "dummy" || normalized === "openrouter") {
    return normalized;
  }

  throw new Error(`[config/env] SMART_FEED_AI_PROVIDER must be one of "openrouter" or "dummy".`);
}

function assertValidTimeZone(name: string, timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new Error(`[config/env] Invalid ${name} timezone "${timeZone}".`);
  }
}

function parseIntegerEnv(
  name: string,
  rawValue: string | undefined,
  defaultValue: number,
  range?: { min?: number; max?: number },
): number {
  const normalized = rawValue?.trim();

  if (!normalized) {
    return defaultValue;
  }

  if (!/^[+-]?\d+$/.test(normalized)) {
    throw new Error(`[config/env] ${name} must be an integer, received "${rawValue}".`);
  }

  const parsed = Number.parseInt(normalized, 10);

  if (range?.min !== undefined && parsed < range.min) {
    throw new Error(`[config/env] ${name} must be >= ${range.min}.`);
  }

  if (range?.max !== undefined && parsed > range.max) {
    throw new Error(`[config/env] ${name} must be <= ${range.max}.`);
  }

  return parsed;
}

function parseOptionalIntegerEnv(
  name: string,
  rawValue: string | undefined,
  range?: { min?: number; max?: number },
): number | null {
  const normalized = rawValue?.trim();

  if (!normalized) {
    return null;
  }

  return parseIntegerEnv(name, normalized, 0, range);
}

function getAppEnvSignature(): string {
  return APP_ENV_KEYS.map((key) => `${key}=${process.env[key] ?? ""}`).join("\n");
}

export function loadAppEnv(): AppEnv {
  const timeZone = assertValidTimeZone(
    "SMART_FEED_TIMEZONE",
    parseOptionalString(process.env.SMART_FEED_TIMEZONE) ?? DEFAULT_TIME_ZONE,
  );

  const digestTimeZone = assertValidTimeZone(
    "SMART_FEED_DIGEST_TIMEZONE",
    parseOptionalString(process.env.SMART_FEED_DIGEST_TIMEZONE) ?? timeZone,
  );

  return {
    timeZone,
    timeWindowHours: parseIntegerEnv(
      "SMART_FEED_TIME_WINDOW_HOURS",
      process.env.SMART_FEED_TIME_WINDOW_HOURS,
      DEFAULT_TIME_WINDOW_HOURS,
      { min: 0 },
    ),
    digestTimeZone,
    digestSendHour: parseIntegerEnv(
      "SMART_FEED_DIGEST_SEND_HOUR",
      process.env.SMART_FEED_DIGEST_SEND_HOUR,
      DEFAULT_DIGEST_SEND_HOUR,
      { min: 0, max: 23 },
    ),
    digestMaxLookbackHours: parseIntegerEnv(
      "SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS",
      process.env.SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS,
      DEFAULT_DIGEST_MAX_LOOKBACK_HOURS,
      { min: 1 },
    ),
    valueScoreThreshold: parseIntegerEnv(
      "SMART_FEED_VALUE_SCORE_THRESHOLD",
      process.env.SMART_FEED_VALUE_SCORE_THRESHOLD,
      DEFAULT_VALUE_SCORE_THRESHOLD,
      { min: 0, max: 10 },
    ),
    aiProvider: parseOptionalAiProvider(process.env.SMART_FEED_AI_PROVIDER),
    openRouterApiKey: parseOptionalString(process.env.OPENROUTER_API_KEY),
    openRouterBaseUrl: parseOptionalString(process.env.OPENROUTER_BASE_URL) ?? DEFAULT_OPENROUTER_BASE_URL,
    aiBasicModel: parseOptionalString(process.env.SMART_FEED_AI_BASIC_MODEL),
    aiHeavyModel: parseOptionalString(process.env.SMART_FEED_AI_HEAVY_MODEL),
    smtpHost: parseOptionalString(process.env.SMTP_HOST),
    smtpPort: parseOptionalIntegerEnv("SMTP_PORT", process.env.SMTP_PORT, {
      min: 1,
      max: 65535,
    }),
    smtpUser: parseOptionalString(process.env.SMTP_USER),
    smtpPass: parseOptionalString(process.env.SMTP_PASS),
    smtpFrom: parseOptionalString(process.env.SMTP_FROM),
    smtpTo: parseOptionalString(process.env.SMTP_TO),
  };
}

export function getAppEnv(): Readonly<AppEnv> {
  const signature = getAppEnvSignature();

  if (!cachedAppEnv || cachedAppEnvSignature !== signature) {
    cachedAppEnv = Object.freeze(loadAppEnv());
    cachedAppEnvSignature = signature;
  }

  return cachedAppEnv;
}

export const appEnv = {
  get timeZone() {
    return getAppEnv().timeZone;
  },
  get timeWindowHours() {
    return getAppEnv().timeWindowHours;
  },
  get digestTimeZone() {
    return getAppEnv().digestTimeZone;
  },
  get digestSendHour() {
    return getAppEnv().digestSendHour;
  },
  get digestMaxLookbackHours() {
    return getAppEnv().digestMaxLookbackHours;
  },
  get valueScoreThreshold() {
    return getAppEnv().valueScoreThreshold;
  },
  get aiProvider() {
    return getAppEnv().aiProvider;
  },
  get openRouterApiKey() {
    return getAppEnv().openRouterApiKey;
  },
  get openRouterBaseUrl() {
    return getAppEnv().openRouterBaseUrl;
  },
  get aiBasicModel() {
    return getAppEnv().aiBasicModel;
  },
  get aiHeavyModel() {
    return getAppEnv().aiHeavyModel;
  },
  get smtpHost() {
    return getAppEnv().smtpHost;
  },
  get smtpPort() {
    return getAppEnv().smtpPort;
  },
  get smtpUser() {
    return getAppEnv().smtpUser;
  },
  get smtpPass() {
    return getAppEnv().smtpPass;
  },
  get smtpFrom() {
    return getAppEnv().smtpFrom;
  },
  get smtpTo() {
    return getAppEnv().smtpTo;
  },
} satisfies Readonly<AppEnv>;

export type { AiProvider, AppEnv };
