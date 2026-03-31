type DatabaseEnv = {
  databaseUrl: string;
  databaseSsl: boolean;
};

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "require"]);
const FALSY_VALUES = new Set(["0", "false", "no", "off", "disable"]);

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

let cachedDatabaseEnv: Readonly<DatabaseEnv> | null = null;

export function getDatabaseEnv(): Readonly<DatabaseEnv> {
  cachedDatabaseEnv ??= Object.freeze(loadDatabaseEnv());
  return cachedDatabaseEnv;
}

export const databaseEnv = {
  get databaseUrl() {
    return getDatabaseEnv().databaseUrl;
  },
  get databaseSsl() {
    return getDatabaseEnv().databaseSsl;
  },
} satisfies Readonly<DatabaseEnv>;

export type { DatabaseEnv };
