import mysql from "mysql2/promise";
import { config } from "../config";

let pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.certificate_db.host,
      port: config.certificate_db.port,
      user: config.certificate_db.user,
      password: config.certificate_db.password,
      database: config.certificate_db.database,
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
  batchSize: number,
  lastId: number | string | null,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();
  await pool.query("SELECT 1");
  console.log("MySQL connected");

  while (true) {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT id,email FROM \`${table}\` LIMIT 10`,
    );

    const list = Array.isArray(rows) ? rows : [];

    if (!list.length) break;

    lastId = list[list.length - 1][primaryKey] as number | string;

    yield list as Record<string, unknown>[];
  }

  console.log("Finished MySQL extraction", { table });
}

export async function countMysqlRows(table: string): Promise<number> {
  const pool = getMysqlPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM \`${table}\``,
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
