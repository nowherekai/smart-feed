import { defineConfig } from "drizzle-kit";

import { loadDatabaseEnv } from "./src/db/env";

const { databaseUrl } = loadDatabaseEnv();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
