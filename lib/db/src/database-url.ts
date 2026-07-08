const preferredEnvNames = {
  development: [
    "DATABASE_URL_DEVELOPMENT",
    "DATABASE_URL_DEV",
    "DEV_DATABASE_URL",
    "DATABASE_URL",
    "REPLIT_DB_URL",
    "REPLIT_DATABASE_URL",
    "DB_URL",
  ],
  production: [
    "DATABASE_URL_PRODUCTION",
    "DATABASE_URL_PROD",
    "PROD_DATABASE_URL",
    "DATABASE_URL",
    "REPLIT_DB_URL",
    "REPLIT_DATABASE_URL",
    "DB_URL",
  ],
} as const;

export function resolveDatabaseUrl(): string | null {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  const mode = nodeEnv === "production" ? "production" : "development";
  const candidates = preferredEnvNames[mode];

  for (const envName of candidates) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }

  for (const envName of [
    "DATABASE_URL",
    "DATABASE_URL_DEVELOPMENT",
    "DATABASE_URL_DEV",
    "DATABASE_URL_PRODUCTION",
    "DATABASE_URL_PROD",
    "DEV_DATABASE_URL",
    "PROD_DATABASE_URL",
    "REPLIT_DB_URL",
    "REPLIT_DATABASE_URL",
    "DB_URL",
  ]) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }

  return null;
}

export function getDatabaseUrlErrorMessage(): string {
  return "No database URL was resolved. Set DATABASE_URL, or provide DATABASE_URL_DEVELOPMENT/DATABASE_URL_PRODUCTION (or DEV_DATABASE_URL/PROD_DATABASE_URL, REPLIT_DB_URL/REPLIT_DATABASE_URL).";
}
