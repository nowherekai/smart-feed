import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseEnv } from "./env";
import * as schema from "./schema";

function createSqlClient() {
  const databaseEnv = getDatabaseEnv();

  return postgres(databaseEnv.databaseUrl, {
    ssl: databaseEnv.databaseSsl ? "require" : false,
  });
}

function createDb() {
  return drizzle(getSqlClient(), { schema });
}

type SqlClient = ReturnType<typeof createSqlClient>;
type Database = ReturnType<typeof createDb>;

let cachedSqlClient: SqlClient | null = null;
let cachedDb: Database | null = null;

export function getSqlClient(): SqlClient {
  cachedSqlClient ??= createSqlClient();
  return cachedSqlClient;
}

export function getDb(): Database {
  cachedDb ??= createDb();
  return cachedDb;
}

function createLazyProxy<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_target, property, receiver) {
      const target = factory();
      const value = Reflect.get(target, property, receiver);

      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const sqlClient = createLazyProxy(getSqlClient);
export const db = createLazyProxy(getDb);

export type { Database };
