/**
 * 应用环境变量配置与验证模块
 * 负责从 process.env 中读取并校验 SMART_FEED_* 系列及相关基础设施的环境变量。
 */

/**
 * 应用配置对象类型定义
 */
type AppEnv = {
  /** 应用主时区 (如: Asia/Shanghai) */
  timeZone: string;
  /** 内容抓取的滚动时间窗口（小时），超出此窗口的内容将仅记录哨兵而不进入流水线 */
  timeWindowHours: number;
  /** 摘要报告的时区，默认为 timeZone */
  digestTimeZone: string;
  /** 摘要报告发送的小时时刻 (0-23) */
  digestSendHour: number;
  /** 摘要报告最大回溯的小时数 */
  digestMaxLookbackHours: number;
  /** 是否启用邮件投递 */
  emailDeliveryEnabled: boolean;
  /** 触发深度分析的价值评分阈值 (0-10) */
  valueScoreThreshold: number;
  /** AI 服务商类型: dummy (假数据) 或 openrouter */
  aiProvider: AiProvider | null;
  /** OpenRouter API Key */
  openRouterApiKey: string | null;
  /** OpenRouter API 基础地址 */
  openRouterBaseUrl: string;
  /** 基础分析（轻量级）使用的 AI 模型 ID */
  aiBasicModel: string | null;
  /** 深度摘要使用的 AI 模型 ID */
  aiHeavyModel: string | null;
  /** SMTP 服务器地址 */
  smtpHost: string | null;
  /** SMTP 服务器端口 */
  smtpPort: number | null;
  /** SMTP 用户名 */
  smtpUser: string | null;
  /** SMTP 密码 */
  smtpPass: string | null;
  /** 邮件发件人地址 */
  smtpFrom: string | null;
  /** 邮件收件人地址 */
  smtpTo: string | null;
};

/** AI 服务商可选类型 */
type AiProvider = "dummy" | "openrouter";

// 默认值常量定义
const DEFAULT_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_TIME_WINDOW_HOURS = 72;
const DEFAULT_DIGEST_SEND_HOUR = 8;
const DEFAULT_DIGEST_MAX_LOOKBACK_HOURS = 48;
const DEFAULT_VALUE_SCORE_THRESHOLD = 6;
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** 需要监控变更的环境变量键列表，用于缓存失效判断 */
const APP_ENV_KEYS = [
  "SMART_FEED_TIMEZONE",
  "SMART_FEED_TIME_WINDOW_HOURS",
  "SMART_FEED_DIGEST_TIMEZONE",
  "SMART_FEED_DIGEST_SEND_HOUR",
  "SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS",
  "SMART_FEED_EMAIL_DELIVERY_ENABLED",
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

// 缓存变量，避免重复解析
let cachedAppEnv: Readonly<AppEnv> | null = null;
let cachedAppEnvSignature: string | null = null;

/**
 * 解析可选字符串，并进行去空格处理
 */
function parseOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * 解析 AI 服务商环境变量，校验合法性
 */
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

/**
 * 解析布尔值环境变量
 */
function parseBooleanEnv(name: string, rawValue: string | undefined, defaultValue: boolean): boolean {
  const normalized = rawValue?.trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(`[config/env] ${name} must be a boolean, received "${rawValue}".`);
}

/**
 * 确保必填字符串存在
 */
function requireStringEnv(name: string, value: string | null): string {
  if (!value) {
    throw new Error(`[config/env] ${name} is required when SMART_FEED_EMAIL_DELIVERY_ENABLED is true.`);
  }

  return value;
}

/**
 * 校验时区标识符是否合法
 */
function assertValidTimeZone(name: string, timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new Error(`[config/env] Invalid ${name} timezone "${timeZone}".`);
  }
}

/**
 * 解析整数环境变量，支持范围校验
 */
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

/**
 * 解析可选整数环境变量
 */
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

/**
 * 获取当前配置的指纹，用于检测配置是否发生变化
 */
function getAppEnvSignature(): string {
  return APP_ENV_KEYS.map((key) => `${key}=${process.env[key] ?? ""}`).join("\n");
}

/**
 * 核心加载逻辑：从环境变量中提取配置并执行深度验证
 */
export function loadAppEnv(): AppEnv {
  // 1. 基础配置与时区校验
  const timeZone = assertValidTimeZone(
    "SMART_FEED_TIMEZONE",
    parseOptionalString(process.env.SMART_FEED_TIMEZONE) ?? DEFAULT_TIME_ZONE,
  );

  const digestTimeZone = assertValidTimeZone(
    "SMART_FEED_DIGEST_TIMEZONE",
    parseOptionalString(process.env.SMART_FEED_DIGEST_TIMEZONE) ?? timeZone,
  );

  // 2. 邮件发送相关校验（若启用，则相关 SMTP 字段必填）
  const emailDeliveryEnabled = parseBooleanEnv(
    "SMART_FEED_EMAIL_DELIVERY_ENABLED",
    process.env.SMART_FEED_EMAIL_DELIVERY_ENABLED,
    false,
  );
  const smtpHost = parseOptionalString(process.env.SMTP_HOST);
  const smtpPort = parseOptionalIntegerEnv("SMTP_PORT", process.env.SMTP_PORT, {
    min: 1,
    max: 65535,
  });
  const smtpUser = parseOptionalString(process.env.SMTP_USER);
  const smtpPass = parseOptionalString(process.env.SMTP_PASS);
  const smtpFrom = parseOptionalString(process.env.SMTP_FROM);
  const smtpTo = parseOptionalString(process.env.SMTP_TO);

  if (emailDeliveryEnabled) {
    requireStringEnv("SMTP_HOST", smtpHost);

    if (smtpPort === null) {
      throw new Error("[config/env] SMTP_PORT is required when SMART_FEED_EMAIL_DELIVERY_ENABLED is true.");
    }

    requireStringEnv("SMTP_USER", smtpUser);
    requireStringEnv("SMTP_PASS", smtpPass);
    requireStringEnv("SMTP_FROM", smtpFrom);
    requireStringEnv("SMTP_TO", smtpTo);
  }

  // 3. 返回完整的配置对象
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
    emailDeliveryEnabled,
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
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
    smtpTo,
  };
}

/**
 * 获取应用配置（带缓存机制）
 */
export function getAppEnv(): Readonly<AppEnv> {
  const signature = getAppEnvSignature();

  if (!cachedAppEnv || cachedAppEnvSignature !== signature) {
    cachedAppEnv = Object.freeze(loadAppEnv());
    cachedAppEnvSignature = signature;
  }

  return cachedAppEnv;
}

/**
 * 导出的单例配置对象，支持按需读取
 */
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
  get emailDeliveryEnabled() {
    return getAppEnv().emailDeliveryEnabled;
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
