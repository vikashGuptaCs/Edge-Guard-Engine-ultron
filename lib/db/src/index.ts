import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const missingDatabaseUrlMessage =
  "DATABASE_URL must be set. Did you forget to provision a database?";

export const hasDatabaseConfig = Boolean(process.env.DATABASE_URL);
export const databaseInitializationError = hasDatabaseConfig
  ? null
  : missingDatabaseUrlMessage;

export const pool = hasDatabaseConfig
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

const liveDb = pool ? drizzle(pool, { schema }) : null;

export const db = (liveDb ??
  new Proxy(
    {},
    {
      get() {
        throw new Error(missingDatabaseUrlMessage);
      },
    },
  )) as typeof drizzle extends (...args: any[]) => infer T ? T : never;

export * from "./schema";
