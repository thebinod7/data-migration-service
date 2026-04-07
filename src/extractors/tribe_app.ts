import { Pool } from "pg";
import { config } from "../config";
import { logger } from "../utils/logger";
import { MIGRATION_TABLE } from "../config/tables";
import { BATCH_SIZE } from "../constants/contants";

let pool: Pool | null = null;

export function getPgPool() {
  if (!pool) {
    pool = new Pool({
      ...config.tribe_db,
      max: 10,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 5000,
    });
  }
  return pool;
}



/**
 * Fetch invites in batches with OFFSET/LIMIT (stable order: createdAt, id).
 * Pass `initialOffset` from checkpoint to resume.
 */
export async function* fetchInvitesInBatches({
  limit = BATCH_SIZE,
  initialOffset = 0,
} = {}) {
  const client = getPgPool();
  let offset = initialOffset;

  while (true) {
    const query = `
    SELECT *
    FROM ${MIGRATION_TABLE.TRIBE.INVITES}
    ORDER BY "createdAt" ASC, id::text ASC
    LIMIT $1
    OFFSET $2
  `;

    const { rows } = await client.query(query, [limit, offset]);
    console.log("tribe invites batch:", rows[0]);

    if (rows.length === 0) break;

    yield rows;

    offset += rows.length;
  }
}

export async function* fetchTribeListInBatches({
  limit = BATCH_SIZE,
  initialOffset = 0,
} = {}) {
  const client = getPgPool();
  let offset = initialOffset;

  while (true) {
    const query = `
    SELECT *
    FROM ${MIGRATION_TABLE.TRIBE.TRIBES}
    ORDER BY "createdAt" ASC, id::text ASC
    LIMIT $1
    OFFSET $2
  `;

    const { rows } = await client.query(query, [limit, offset]);
    console.log("tribes list batch:", rows[0]);

    if (rows.length === 0) break;

    yield rows;

    offset += rows.length;
  }
}

/** Demo helper: list first 10 rows from a Postgres table (uses first postgres table from config, or tbl_tribes). */
export const listTribes = async () => {
  try {
    const table =
      config.tables.find((t) => t.source === "postgres")?.sourceTable ??
      "tbl_tribes";
    const pool = getPgPool();
    const res = await pool.query(`SELECT * FROM "${table}" LIMIT 10`);
    return res.rows;
  } catch (err: any) {
    logger.error("Error fetching tribes", { error: err?.message });
  } finally {
    await closeTribePgPool();
  }
};

export const testPgConnection = async () => {
  try {
    const pool = getPgPool();
    const res = await pool.query(`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE'
    AND table_schema NOT IN ('pg_catalog', 'information_schema');
`);
    console.log("NOW=>", res.rows);
  } catch (err: any) {
    logger.warn("Postgres connection test", { error: err?.message });
  }
};

export async function* extractTribeAppDataBatched(
  table: string,
  pkColumn: string,
  batchSize: number,
  lastId: number | string | null,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getPgPool();

  while (true) {
    const { rows } = await pool.query(
      `
      SELECT * FROM "${table}"
      WHERE "${pkColumn}" > $1
      ORDER BY "${pkColumn}"
      LIMIT $2
      `,
      [lastId ?? 0, batchSize],
    );
    if (!rows.length) break;

    lastId = rows[rows.length - 1][pkColumn] as number | string;
    yield rows;
  }
  // console.log("Finished tribe app tables extraction", { table });
}

export async function countPgRows(table: string): Promise<number> {
  const pool = getPgPool();
  const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
  return Number(result.rows[0].count);
}

async function findTotalRows(table: string): Promise<number> {
  const pool = getPgPool();
  const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
  return Number(result.rows[0].count);
}

export async function closeTribePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
