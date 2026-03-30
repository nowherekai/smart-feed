import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type DatabaseEnv = {
  databaseUrl: string;
  databaseSsl: boolean;
};

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "require"]);
const FALSY_VALUES = new Set(["0", "false", "no", "off", "disable"]);

function loadEnvFileIfNeeded(filePath: string): void {
  const absolutePath = resolve(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const content = readFileSync(absolutePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
}

function ensureDatabaseEnvLoaded(): void {
  if (process.env.DATABASE_URL !== undefined) {
    return;
  }

  loadEnvFileIfNeeded(".env.local");
  loadEnvFileIfNeeded(".env");
}

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

  throw new Error(
    `[db/env] Invalid ${name} value "${rawValue}". Use true/false, 1/0, yes/no, on/off, or require.`,
  );
}

export function loadDatabaseEnv(): DatabaseEnv {
  ensureDatabaseEnvLoaded();

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "[db/env] Missing DATABASE_URL. Add it to .env.local or .env. See .env.example for the expected format.",
    );
  }

  return {
    databaseUrl,
    databaseSsl: parseBooleanEnv("DATABASE_SSL", process.env.DATABASE_SSL),
  };
}

export const databaseEnv = Object.freeze(loadDatabaseEnv());

export type { DatabaseEnv };
