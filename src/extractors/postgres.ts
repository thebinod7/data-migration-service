import { Pool } from "pg";
import { config } from "../config";

let pool: Pool | null = null;

export function getPgPool() {
  if (!pool) {
    pool = new Pool({
      ...config.postgres,
      max: 10,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 5000,
    });
  }
  return pool;
}

export const listTribes = async () => {
  try {
    const pool = getPgPool();
    const res = await pool.query(`
      SELECT *
      FROM tbl_tribes
      LIMIT 10;
    `);
    return res.rows;
  } catch (err: any) {
    console.error("Error fetching tribes:", err.message);
  } finally {
    await closePgPool();
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
  } catch (err) {
    console.log("PG_Err=>", err);
  }
};

export async function* extractPostgresBatched(
  table: string,
  primaryKey: string,
  batchSize = config.migration.batchSize,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getPgPool();
  let lastId: number | string | null = null;
  let hasMore = true;

  console.log(`[Postgres] Starting extraction from '${table}'`);

  while (hasMore) {
    const whereClause: any = lastId !== null ? `WHERE ${primaryKey} > $1` : "";
    const query = `
      SELECT * FROM "${table}"
      ${whereClause}
      ORDER BY ${primaryKey} ASC
      LIMIT ${batchSize}
    `;

    const params: any = lastId !== null ? [lastId] : [];
    const result = await pool.query(query, params);
    const rows = result.rows;
    console.log("ROWS=>", rows);

    if (rows.length === 0) {
      hasMore = false;
    } else {
      lastId = rows[rows.length - 1][primaryKey];
      console.log(
        `[Postgres] Fetched ${rows.length} rows from '${table}', last id: ${lastId}`,
      );
      yield rows;

      if (rows.length < batchSize) hasMore = false;
    }
  }

  console.log(`[Postgres] Finished extraction from '${table}'`);
}

export async function countPgRows(table: string): Promise<number> {
  const pool = getPgPool();
  const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
  return Number(result.rows[0].count);
}

export async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
