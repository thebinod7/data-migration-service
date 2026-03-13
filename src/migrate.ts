import "dotenv/config";
import { config } from "./config";
import type { TableConfig } from "./config";
import { logger } from "./utils/logger";
import {
  initCheckpointFromEnv,
  getLastPrimaryKey,
  saveCheckpoint,
  isCheckpointDisabled,
} from "./utils/checkpoint";
import {
  extractPostgresBatched,
  closePgPool,
  countPgRows,
} from "./extractors/postgres";
import {
  extractMysqlBatched,
  closeMysqlPool,
  countMysqlRows,
} from "./extractors/mysql";
import { getTransform, transformBatch } from "./transformers/normalize";
import { writeBatch } from "./importer/convex";
import { verifyAll } from "./verify/integrity";

function getTablesToMigrate(): TableConfig[] {
  let tables = config.tables;
  if (config.tablesFilter?.length) {
    const set = new Set(config.tablesFilter);
    tables = tables.filter((t) => set.has(t.convexTable));
    logger.info("Tables filter applied", {
      filter: config.tablesFilter,
      count: tables.length,
    });
  }
  return tables;
}

async function migrateTable(tableConfig: TableConfig): Promise<void> {
  const {
    source,
    sourceTable,
    convexTable,
    primaryKey,
    transform: transformName,
  } = tableConfig;
  const batchSize = config.migration.batchSize;
  // Get the last primary key from the checkpoint
  const resumeAfterId = getLastPrimaryKey(convexTable);

  const transformFn = getTransform(transformName, primaryKey);

  const extractor =
    source === "postgres"
      ? extractPostgresBatched(
        sourceTable,
        primaryKey,
        batchSize,
        resumeAfterId,
      )
      : extractMysqlBatched(sourceTable, primaryKey, batchSize, resumeAfterId);


  for await (const rows of extractor) {
    const documents = transformBatch(rows, transformFn);
    if (!config.dryRun) {
      await writeBatch(convexTable, documents);
    } else {
      logger.debug("Dry run: skip Convex write", {
        table: convexTable,
        count: documents.length,
      });
    }
    const lastId = rows[rows.length - 1][primaryKey];
    if (lastId !== undefined && lastId !== null && !isCheckpointDisabled()) {
      saveCheckpoint(convexTable, lastId as number | string);
    }
  }
}

async function run(): Promise<void> {
  logger.info("Migration started", {
    dryRun: config.dryRun,
    tablesFilter: config.tablesFilter ?? null,
  });

  // 1. Check if checkpoint is disabled
  initCheckpointFromEnv();

  // 2. Get tables to migrate
  const tables = getTablesToMigrate();
  if (tables.length === 0) {
    logger.warn("No tables to migrate");
    return;
  }

  // 3. Migrate tables
  try {
    for (const tableConfig of tables) {
      logger.info("Migrating table", {
        source: tableConfig.source,
        sourceTable: tableConfig.sourceTable,
        convexTable: tableConfig.convexTable,
      });
      await migrateTable(tableConfig);
    }
  } finally {
    await closePgPool();
    await closeMysqlPool();
  }

  const skipVerify =
    process.env.SKIP_VERIFY === "true" || process.env.SKIP_VERIFY === "1";
  if (!skipVerify && !config.dryRun) {
    logger.info("Running verification");
    try {
      const { results, allPassed } = await verifyAll(tables);
      for (const r of results) {
        logger.info(r.match ? "Verify OK" : "Verify mismatch", {
          table: r.table,
          message: r.message,
        });
      }
      if (!allPassed) {
        logger.warn(
          "Verification had mismatches (or Convex getCount not deployed)",
        );
      }
    } finally {
      await closePgPool();
      await closeMysqlPool();
    }
  } else if (config.dryRun) {
    logger.info("Dry run: verification skipped");
  }

  logger.info("Migration finished");
}

run().catch((err) => {
  logger.error("Migration failed", { error: err?.message, stack: err?.stack });
  process.exit(1);
});
