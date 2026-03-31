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
  let instance: T | null = null;

  function getInstance(): T {
    instance ??= factory();
    return instance;
  }

  return new Proxy({} as T, {
    get(_target, property) {
      const target = getInstance();
      const value = Reflect.get(target, property);

      return typeof value === "function" ? value.bind(target) : value;
    },
    ownKeys() {
      return Reflect.ownKeys(getInstance());
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(getInstance(), property);
    },
    has(_target, property) {
      return Reflect.has(getInstance(), property);
    },
  });
}

export const sqlClient = createLazyProxy(getSqlClient);
export const db = createLazyProxy(getDb);

export type { Database };
