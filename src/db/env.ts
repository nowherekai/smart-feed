/**
 * 数据库环境变量配置模块
 * 专门处理数据库连接相关的环境变量，如 DATABASE_URL 和 SSL 配置。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const ENV_FILE_PATHS = [".env.local", ".env"] as const;

function parseEnvFileValue(rawValue: string): string {
  const trimmedValue = rawValue.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function loadEnvValueFromFiles(name: string): string | undefined {
  const envPattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)\\s*$`);

  for (const filePath of ENV_FILE_PATHS) {
    const absolutePath = resolve(process.cwd(), filePath);

    if (!existsSync(absolutePath)) {
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const match = line.match(envPattern);

      if (!match) {
        continue;
      }

      const [, rawValue = ""] = match;
      return parseEnvFileValue(rawValue);
    }
  }

  return undefined;
}

function readDatabaseEnvValue(name: "DATABASE_URL" | "DATABASE_SSL"): string | undefined {
  const currentValue = process.env[name]?.trim();

  if (currentValue) {
    return currentValue;
  }

  const fileValue = loadEnvValueFromFiles(name)?.trim();

  if (!fileValue) {
    return undefined;
  }

  process.env[name] = fileValue;
  return fileValue;
}

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
  const databaseUrl = readDatabaseEnvValue("DATABASE_URL");

  if (!databaseUrl) {
    throw new Error(
      "[db/env] Missing DATABASE_URL. Add it to .env.local or .env, or export it before running the command.",
    );
  }

  return {
    databaseUrl,
    databaseSsl: parseBooleanEnv("DATABASE_SSL", readDatabaseEnvValue("DATABASE_SSL")),
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
