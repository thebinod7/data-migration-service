function parseTablesFilter(): string[] | undefined {
  const raw = process.env.TABLES_FILTER;
  if (!raw?.trim()) return undefined;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

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

  /** When true, only extract and transform; do not write to Convex. */
  dryRun: process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1",
  /** Optional list of convexTable names to migrate (e.g. TABLES_FILTER=tribes,users). */
  tablesFilter: parseTablesFilter(),

  // Define which tables migrate from which source
  // and how they map to Convex tables (sourceTable = real DB table name)
  tables: [
    {
      source: "mysql" as const,
      sourceTable: "users",
      convexTable: "users",
      primaryKey: "id",
      transform: "transformUser",
    },
    {
      source: "postgres" as const,
      sourceTable: "tbl_tribes",
      convexTable: "tribes",
      primaryKey: "id",
      transform: "transformTribe",
    },
    {
      source: "mysql" as const,
      sourceTable: "products",
      convexTable: "products",
      primaryKey: "id",
      transform: "transformProduct",
    },
    // Add more tables here...
  ],
};

export type TableConfig = (typeof config.tables)[number];
