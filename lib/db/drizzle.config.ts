import { defineConfig } from "drizzle-kit";
import path from "path";
import { getDatabaseUrlErrorMessage, resolveDatabaseUrl } from "./src/database-url";

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
  throw new Error(getDatabaseUrlErrorMessage());
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
