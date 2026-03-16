import "dotenv/config";
import type { TableConfig } from "./config";
import { config } from "./config";
import { closeMysqlPool, extractMysqlBatched } from "./extractors/mysql";
import { closePgPool, extractPostgresBatched } from "./extractors/postgres";
import { writeBatch } from "./importer/convex";
import {
  getLastPrimaryKey,
  initCheckpointFromEnv,
  isCheckpointDisabled,
  saveCheckpoint,
} from "./utils/checkpoint";
import { logger } from "./utils/logger";

async function runMigration(): Promise<void> {
  logger.info("Migration started", {
    dryRun: config.dryRun,
  });

  // 1. Check if checkpoint is disabled
  initCheckpointFromEnv();

  // 2. Get tables to migrate
  const tables = config.tables;
  if (tables.length === 0) {
    logger.warn("No tables to migrate");
    return;
  }

  // 3. Migrate tables
  try {
    for (const tableConfig of tables) {
      console.log("Migrating table", tableConfig);
      await migrateTribeAppDataToConvex(tableConfig);
      // Migrate Certificate App Data
      // Migrate WP App Data
    }
  } finally {
    await closePgPool();
    await closeMysqlPool();
  }

  logger.info("Migration finished");
}

runMigration().catch((err) => {
  logger.error("Migration failed", { error: err?.message, stack: err?.stack });
  process.exit(1);
});

async function migrateTribeAppDataToConvex(
  tableConfig: TableConfig,
): Promise<void> {
  const { source, sourceTable, convexTable, primaryKey } = tableConfig;

  const batchSize = config.migration.batchSize;
  const resumeAfterId = getLastPrimaryKey(convexTable);

  const pgExtractor = extractPostgresBatched(
    sourceTable,
    primaryKey,
    batchSize,
    resumeAfterId,
  );

  for await (const rows of pgExtractor) {
    // TODO: tranform rows and save checkpoint
    if (!config.dryRun) {
      await writeBatch(convexTable, rows);
    } else {
      logger.debug("Dry run: skip Convex write", {
        table: convexTable,
        count: rows.length,
      });
    }

    const lastId = rows[rows.length - 1][primaryKey];
    if (lastId != null && !isCheckpointDisabled()) {
      saveCheckpoint(convexTable, lastId as number | string);
    }
  }
}
