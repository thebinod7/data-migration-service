import "dotenv/config";
import type { TableConfig } from "./config";
import { config } from "./config";
import {
  closeMysqlPool,
  extractMysqlBatched
} from "./extractors/mysql";
import {
  closePgPool,
  extractPostgresBatched
} from "./extractors/postgres";
import { writeBatch } from "./importer/convex";
import {
  getLastPrimaryKey,
  initCheckpointFromEnv,
  isCheckpointDisabled,
  saveCheckpoint,
} from "./utils/checkpoint";
import { logger } from "./utils/logger";


async function migrateTable(tableConfig: TableConfig): Promise<void> {
  const { source, sourceTable, convexTable, primaryKey } = tableConfig;

  const batchSize = config.migration.batchSize;
  const resumeAfterId = getLastPrimaryKey(convexTable);

  const extractor =
    source === "postgres"
      ? extractPostgresBatched(sourceTable, primaryKey, batchSize, resumeAfterId)
      : extractMysqlBatched(sourceTable, primaryKey, batchSize, resumeAfterId);

  for await (const rows of extractor) {
    if (!config.dryRun) await writeBatch(convexTable, rows);
    else {
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

async function run(): Promise<void> {
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
      await migrateTable(tableConfig);
    }
  } finally {
    await closePgPool();
    await closeMysqlPool();
  }

  // const skipVerify =
  //   process.env.SKIP_VERIFY === "true" || process.env.SKIP_VERIFY === "1";
  // if (!skipVerify && !config.dryRun) {
  //   logger.info("Running verification");
  //   try {
  //     const { results, allPassed } = await verifyAll(tables);
  //     for (const r of results) {
  //       logger.info(r.match ? "Verify OK" : "Verify mismatch", {
  //         table: r.table,
  //         message: r.message,
  //       });
  //     }
  //     if (!allPassed) {
  //       logger.warn(
  //         "Verification had mismatches (or Convex getCount not deployed)",
  //       );
  //     }
  //   } finally {
  //     await closePgPool();
  //     await closeMysqlPool();
  //   }
  // } else if (config.dryRun) {
  //   logger.info("Dry run: verification skipped");
  // }

  logger.info("Migration finished");
}

run().catch((err) => {
  logger.error("Migration failed", { error: err?.message, stack: err?.stack });
  process.exit(1);
});
