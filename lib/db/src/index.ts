import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { getDatabaseUrlErrorMessage, resolveDatabaseUrl } from "./database-url";

const { Pool } = pg;
const databaseUrl = resolveDatabaseUrl();
const missingDatabaseUrlMessage = getDatabaseUrlErrorMessage();

export const hasDatabaseConfig = Boolean(databaseUrl);
export const databaseInitializationError = hasDatabaseConfig
  ? null
  : missingDatabaseUrlMessage;

export const pool = hasDatabaseConfig
  ? new Pool({ connectionString: databaseUrl! })
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
