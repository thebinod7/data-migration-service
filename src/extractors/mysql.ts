import mysql from "mysql2/promise";
import { config } from "../config";
import { logger } from "../utils/logger";

let pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function* extractMysqlBatched(
  table: string,
  primaryKey: string,
  batchSize = config.migration.batchSize,
  resumeAfterId: number | string | null = null,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();
  let lastId: number | string | null = resumeAfterId;
  let hasMore = true;

  logger.info("Starting MySQL extraction", { table, primaryKey, resumeAfterId });

  while (hasMore) {
    const whereClause = lastId !== null ? `WHERE \`${primaryKey}\` > ?` : "";
    const query = `
      SELECT * FROM \`${table}\`
      ${whereClause}
      ORDER BY \`${primaryKey}\` ASC
      LIMIT ?
    `;
    const params: (number | string)[] = lastId !== null ? [lastId, batchSize] : [batchSize];
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    const list = Array.isArray(rows) ? rows : [];

    if (list.length === 0) {
      hasMore = false;
    } else {
      const last = list[list.length - 1];
      lastId = last[primaryKey] as number | string;
      logger.debug("MySQL batch fetched", { table, count: list.length, lastId });
      yield list as Record<string, unknown>[];
      if (list.length < batchSize) hasMore = false;
    }
  }

  logger.info("Finished MySQL extraction", { table });
}

export async function countMysqlRows(table: string): Promise<number> {
  const pool = getMysqlPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM \`${table}\``
  );
  const row = Array.isArray(rows) ? rows[0] : (rows as any)?.[0];
  return Number(row?.count ?? 0);
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
