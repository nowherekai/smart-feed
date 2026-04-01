/**
 * 数据库环境变量配置模块
 * 专门处理数据库连接相关的环境变量，如 DATABASE_URL 和 SSL 配置。
 */

/**
 * 数据库配置对象类型定义
 */
type DatabaseEnv = {
  /** 数据库连接字符串 (如: postgres://user:pass@host:port/db) */
  databaseUrl: string;
  /** 是否启用 SSL 连接 */
  databaseSsl: boolean;
};

// 布尔值解析辅助常量
const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "require"]);
const FALSY_VALUES = new Set(["0", "false", "no", "off", "disable"]);

/**
 * 通用布尔值环境变量解析函数
 */
function parseBooleanEnv(name: string, rawValue: string | undefined): boolean {
  if (rawValue === undefined || rawValue.trim() === "") {
    return false;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (TRUTHY_VALUES.has(normalized)) {
    return true;
  }

  if (FALSY_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`[db/env] Invalid ${name} value "${rawValue}". Use true/false, 1/0, yes/no, on/off, or require.`);
}

/**
 * 加载数据库环境变量并执行校验
 */
export function loadDatabaseEnv(): DatabaseEnv {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "[db/env] Missing DATABASE_URL. Add it to .env.local or .env. Bun and Next.js will load it automatically.",
    );
  }

  return {
    databaseUrl,
    databaseSsl: parseBooleanEnv("DATABASE_SSL", process.env.DATABASE_SSL),
  };
}

// 缓存解析后的配置
let cachedDatabaseEnv: Readonly<DatabaseEnv> | null = null;

/**
 * 获取数据库配置（带单例缓存）
 */
export function getDatabaseEnv(): Readonly<DatabaseEnv> {
  cachedDatabaseEnv ??= Object.freeze(loadDatabaseEnv());
  return cachedDatabaseEnv;
}

/**
 * 导出的单例数据库配置对象
 */
export const databaseEnv = {
  get databaseUrl() {
    return getDatabaseEnv().databaseUrl;
  },
  get databaseSsl() {
    return getDatabaseEnv().databaseSsl;
  },
} satisfies Readonly<DatabaseEnv>;

export type { DatabaseEnv };
