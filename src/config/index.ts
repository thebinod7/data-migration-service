import { DB_SOURCES } from "../constants/contants";

export const config = {
  mysql: {
    host: process.env.MYSQL_HOST!,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DATABASE!,
  },
  postgres: {
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
      sourceTable: "tbl_certificates",
      convexTable: "cvx_certificates",
      primaryKey: "id",
    },
  ],
};

export type TableConfig = (typeof config.tables)[number];
