import { DB_SOURCES } from "../constants/contants";

export const config = {
  certificate_db: {
    host: process.env.CERT_DB_HOST!,
    port: Number(process.env.CERT_DB_PORT || 3306),
    user: process.env.CERT_DB_USER!,
    password: process.env.CERT_DB_PASSWORD!,
    database: process.env.CERT_DATABASE!,
  },
  tribe_db: {
    host: process.env.PG_HOST!,
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER!,
    password: process.env.PG_PASSWORD!,
    database: process.env.PG_DATABASE!,
  },
  convex: {
    deploymentUrl: process.env.CONVEX_URL!,
    adminKey: process.env.CONVEX_ADMIN_KEY!,
  },
  migration: {
    batchSize: 100,
    concurrency: 3,
    retryAttempts: 3,
    retryDelayMs: 1000,
  },

  dryRun: process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1",

  // Define which tables migrate from which source
  // and how they map to Convex tables (sourceTable = real DB table name)
  tables: [
    {
      source: DB_SOURCES.TRIBE_APP,
      sourceTable: "tbl_tribes",
      convexTable: "cvx_tribes",
      primaryKey: "id",
    },
    {
      source: DB_SOURCES.TRIBE_APP,
      sourceTable: "tbl_invites",
      convexTable: "cvx_invites",
      primaryKey: "id",
    },
    {
      source: DB_SOURCES.CERTIFICATE_APP,
      sourceTable: "users",
      convexTable: "cvx_users",
      primaryKey: "id",
    },
  ],
};

export type TableConfig = (typeof config.tables)[number];
