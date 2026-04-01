import mysql from "mysql2/promise";
import { config } from "../config";
import { ID_CAP } from "../constants/contants";
import { MIGRATION_TABLE } from "../config/tables";

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

export async function* listImpactPages(
  lastSeenId: number = 0,
  batchSize: number = 5,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();

  let currentId = Math.max(0, Number(lastSeenId) || 0);
  const limit = Math.max(1, Number(batchSize) || 5);

  while (true) {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM impact_pages
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ${limit}
      `,
      [currentId],
    );

    const batch = rows as Record<string, unknown>[];

    if (batch.length === 0) break;

    yield batch;

    currentId = batch[batch.length - 1].id as number;
  }
}
export async function* listPersonalImpactPages(
  lastSeenId: number = 0,
  batchSize: number = 5,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();

  let currentId = Math.max(0, Number(lastSeenId) || 0);
  const limit = Math.max(1, Number(batchSize) || 5);

  const id_cap = 100;

  while (true) {
    if (currentId >= id_cap) break;
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM ${MIGRATION_TABLE.LARAVEL.PERSONAL_IMPACT_PAGES}
      WHERE id > ? AND id <= ?
      ORDER BY id ASC
      LIMIT ${limit}
      `,
      [currentId, id_cap],
    );

    const batch = rows as Record<string, unknown>[];

    if (batch.length === 0) break;

    yield batch;

    currentId = batch[batch.length - 1].id as number;
  }
}

export async function* extractCertificateAppDataBatched(
  table: string,
  pkColumn: string,
  batchSize: number,
  lastId: number | string | null,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();
  // await pool.query("SELECT 1");
  const total = await countMysqlRows(table);
  console.log("Total number of rows", { table, total });

  while (true) {
    const query = `
      SELECT * FROM \`${table}\`
      WHERE \`${pkColumn}\` > ?
      ORDER BY \`${pkColumn}\` ASC
      LIMIT ${batchSize}
    `;

    // Only lastId is passed as parameter
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, [
      lastId ?? 0,
    ]);

    const list = Array.isArray(rows) ? rows : [];

    if (!list.length) break;
    // Update lastId for next batch
    lastId = list[list.length - 1][pkColumn] as number | string;

    // Yield current batch
    yield list as Record<string, unknown>[];
  }

  console.log("Finished certficate app tables extraction", { table });
}

export async function countMysqlRows(table: string): Promise<number> {
  const pool = getMysqlPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM \`${table}\``,
  );
  const row = Array.isArray(rows) ? rows[0] : (rows as any)?.[0];
  return Number(row?.count ?? 0);
}

export async function closeCertificateMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
