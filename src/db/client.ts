import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseEnv } from "./env";
import * as schema from "./schema";

export const sqlClient = postgres(databaseEnv.databaseUrl, {
  ssl: databaseEnv.databaseSsl ? "require" : false,
});

export const db = drizzle(sqlClient, { schema });

export type Database = typeof db;
