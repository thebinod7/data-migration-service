import "dotenv/config";
import type { TableConfig } from "./config";
import { config } from "./config";
import { DB_SOURCES } from "./constants/contants";
import {
  closeCertificateMysqlPool,
  extractCertificateAppDataBatched,
} from "./extractors/certificate_app";
import {
  closeTribePgPool,
  extractTribeAppDataBatched,
} from "./extractors/tribe_app";
import {
  writeCertificateAppDataBached,
  writeTribeAppDataBached,
  writeWordpressAppDataBached,
} from "./importer/convex";
import {
  getLastPrimaryKey,
  initCheckpointFromEnv,
  isCheckpointDisabled,
  saveCheckpoint,
} from "./utils/checkpoint";
import { logger } from "./utils/logger";
import {
  extractWordpressAppDataBatched,
  closeWordpressMysqlPool,
} from "./extractors/wp_app";

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
      if (
        tableConfig.source === DB_SOURCES.TRIBE_APP &&
        tableConfig.runMigration
      ) {
        await migrateTribeAppDataToConvex(tableConfig);
      }
      if (
        tableConfig.source === DB_SOURCES.CERTIFICATE_APP &&
        tableConfig.runMigration
      ) {
        await migrateCertificateAppDataToConvex(tableConfig);
      }
      if (
        tableConfig.source === DB_SOURCES.WORDPRESS_APP &&
        tableConfig.runMigration
      ) {
        await migrateWordpressAppDataToConvex(tableConfig);
      }
    }
  } finally {
    await closeTribePgPool();
    await closeCertificateMysqlPool();
    await closeWordpressMysqlPool();
  }

  logger.info("===Migration finished===");
}

runMigration().catch((err) => {
  logger.error("Migration failed", { error: err?.message, stack: err?.stack });
  process.exit(1);
});

async function migrateTribeAppDataToConvex(
  tableConfig: TableConfig,
): Promise<void> {
  const { sourceTable, convexTable, primaryKey } = tableConfig;

  const batchSize = config.migration.batchSize;
  const resumeAfterId = getLastPrimaryKey(convexTable);

  const pgExtractor = extractTribeAppDataBatched(
    sourceTable,
    primaryKey,
    batchSize,
    resumeAfterId,
  );

  for await (const rows of pgExtractor) {
    if (!config.dryRun) {
      await writeTribeAppDataBached(sourceTable, rows);

      const lastId = rows[rows.length - 1][primaryKey] || 1;
      if (lastId != null && !isCheckpointDisabled()) {
        saveCheckpoint(convexTable, lastId as number | string);
      }
    } else {
      logger.debug("Dry run: skip Convex write", {
        table: convexTable,
        count: rows.length,
      });
    }
  }
}

async function migrateCertificateAppDataToConvex(tableConfig: TableConfig) {
  const { sourceTable, convexTable, primaryKey } = tableConfig;

  const batchSize = config.migration.batchSize;
  const resumeAfterId = getLastPrimaryKey(convexTable);

  const msqlExtractor = extractCertificateAppDataBatched(
    sourceTable,
    primaryKey,
    batchSize,
    resumeAfterId,
  );

  for await (const rows of msqlExtractor) {
    // TODO: tranform rows and save checkpoint
    if (!config.dryRun) {
      await writeCertificateAppDataBached(sourceTable, rows);

      const lastId = rows[rows.length - 1][primaryKey] || 1;
      if (lastId != null && !isCheckpointDisabled()) {
        saveCheckpoint(convexTable, lastId as number | string);
      }
    } else {
      logger.debug("Dry run: skip Convex write", {
        table: convexTable,
        count: rows.length,
      });
    }
  }
}

async function migrateWordpressAppDataToConvex(tableConfig: TableConfig) {
  const { sourceTable, convexTable, primaryKey } = tableConfig;

  const batchSize = config.migration.batchSize;
  const resumeAfterId = getLastPrimaryKey(convexTable);

  const msqlExtractor = extractWordpressAppDataBatched(
    sourceTable,
    primaryKey,
    batchSize,
    resumeAfterId,
  );

  for await (const rows of msqlExtractor) {
    if (!config.dryRun) {
      await writeWordpressAppDataBached(sourceTable, rows);
      const lastId = rows[rows.length - 1][primaryKey] || 1;
      if (lastId != null && !isCheckpointDisabled()) {
        saveCheckpoint(convexTable, lastId as number | string);
      }
    } else {
      logger.debug("Dry run: skip Convex write", {
        table: convexTable,
        count: rows.length,
      });
    }
  }
}
