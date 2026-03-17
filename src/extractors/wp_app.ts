import mysql from "mysql2/promise";
import { config } from "../config";

let pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
    if (!pool) {
        pool = mysql.createPool({
            host: config.wp_db.host,
            port: config.wp_db.port,
            user: config.wp_db.user,
            password: config.wp_db.password,
            database: config.wp_db.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
    }
    return pool;
}

export async function* extractWordpressAppDataBatched(
    table: string,
    pkColumn: string,
    batchSize: number,
    lastId: number | string | null,
): AsyncGenerator<Record<string, unknown>[]> {
    const pool = getMysqlPool();
    await pool.query("SELECT 1");
    // write a code to list all tables in the wp db
    console.log("Wp DB connected");
    const [tables] = await pool.query("SHOW TABLES");
    console.log("Wp DB tables=>", tables);

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

export async function closeMysqlPool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
