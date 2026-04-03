import { Pool } from "pg";
import { config } from "../config";
import { logger } from "../utils/logger";
import { MIGRATION_TABLE } from "../config/tables";

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



/** Cursor after the last successfully migrated row (tie-breaks equal createdAt). */
export type InviteBatchCursor = { createdAt: Date; id: string };

/**
 * Fetch invites in batches using (createdAt, id) cursor for stable pagination + checkpoints.
 */
export async function* fetchInvitesInBatches({
  limit = 100,
  cursor = null as InviteBatchCursor | null,
} = {}) {
  const client = getPgPool();

  while (true) {
    const query = `
    SELECT *
    FROM ${MIGRATION_TABLE.TRIBE.INVITES}
    ${cursor
        ? `WHERE ("createdAt", id::text) > ($2::timestamptz, $3::text)`
        : ""
      }
    ORDER BY "createdAt" ASC, id::text ASC
    LIMIT $1
  `;

    const values = cursor ? [limit, cursor.createdAt, cursor.id] : [limit];

    const { rows } = await client.query(query, values);

    if (rows.length === 0) break;

    yield rows;

    const last = rows[rows.length - 1];
    cursor = {
      createdAt: last.createdAt instanceof Date ? last.createdAt : new Date(last.createdAt),
      id: String(last.id),
    };
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

export async function closeTribePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
