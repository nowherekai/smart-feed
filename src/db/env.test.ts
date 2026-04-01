import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadDatabaseEnv } from "./env";

const DATABASE_ENV_KEYS = ["DATABASE_URL", "DATABASE_SSL"] as const;
const originalCwd = process.cwd();
const originalEnv = new Map<string, string | undefined>();

for (const key of DATABASE_ENV_KEYS) {
  originalEnv.set(key, process.env[key]);
}

function withDatabaseEnv(
  overrides: Partial<Record<(typeof DATABASE_ENV_KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previousValues = new Map<string, string | undefined>();

  for (const key of DATABASE_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    const nextValue = overrides[key];

    if (nextValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextValue;
    }
  }

  try {
    run();
  } finally {
    for (const key of DATABASE_ENV_KEYS) {
      const previousValue = previousValues.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

afterEach(() => {
  process.chdir(originalCwd);

  for (const key of DATABASE_ENV_KEYS) {
    const value = originalEnv.get(key);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("loadDatabaseEnv prefers explicit process.env values", () => {
  withDatabaseEnv(
    {
      DATABASE_URL: "postgres://explicit",
      DATABASE_SSL: "true",
    },
    () => {
      const env = loadDatabaseEnv();

      expect(env.databaseUrl).toBe("postgres://explicit");
      expect(env.databaseSsl).toBe(true);
    },
  );
});

test("loadDatabaseEnv falls back to .env.local for drizzle CLI style execution", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "smart-feed-db-env-local-"));

  try {
    writeFileSync(join(tempDir, ".env.local"), 'DATABASE_URL="postgres://from-local"\nDATABASE_SSL=require\n', "utf8");

    process.chdir(tempDir);

    withDatabaseEnv(
      {
        DATABASE_URL: undefined,
        DATABASE_SSL: undefined,
      },
      () => {
        const env = loadDatabaseEnv();

        expect(env.databaseUrl).toBe("postgres://from-local");
        expect(env.databaseSsl).toBe(true);
        expect(process.env.DATABASE_URL).toBe("postgres://from-local");
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadDatabaseEnv falls back to .env when .env.local is absent", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "smart-feed-db-env-"));

  try {
    writeFileSync(join(tempDir, ".env"), "export DATABASE_URL=postgres://from-env\nDATABASE_SSL=false\n", "utf8");

    process.chdir(tempDir);

    withDatabaseEnv(
      {
        DATABASE_URL: undefined,
        DATABASE_SSL: undefined,
      },
      () => {
        const env = loadDatabaseEnv();

        expect(env.databaseUrl).toBe("postgres://from-env");
        expect(env.databaseSsl).toBe(false);
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadDatabaseEnv throws when DATABASE_URL is missing from both process.env and env files", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "smart-feed-db-env-missing-"));

  try {
    process.chdir(tempDir);

    withDatabaseEnv(
      {
        DATABASE_URL: undefined,
        DATABASE_SSL: undefined,
      },
      () => {
        expect(() => loadDatabaseEnv()).toThrow("Missing DATABASE_URL");
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
