import mysql from "mysql2/promise";
import { config } from "../config";
import { MIGRATION_TABLE } from "../config/tables";
import { AFFILIATE_STATUS_ACTIVE, ID_CAP } from "../constants/contants";
import {
  buildAttemptNumberByPostId,
  type FootprintAttemptRow,
} from "../transformers/footprint-attempt";

const FOOTPRINT_SCORE_META_KEY = "footprint_score";
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

export async function closeWordpressMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// List users by primary key batch (ID-based pagination)
export async function* listWpUsers(
  lastSeenId: number = 0,
  batchSize: number = 5,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();

  let currentId = Math.max(0, Number(lastSeenId) || 0);
  const limit = Math.max(1, Number(batchSize) || 5);

  while (true) {
    if (currentId >= ID_CAP) break;
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM \`${MIGRATION_TABLE.WORDPRESS.USERS}\`
      WHERE ID > ? AND ID <= ?
      ORDER BY ID ASC
      LIMIT ${limit}
      `,
      [currentId, ID_CAP],
    );

    if (!rows.length) break;

    const batch = rows as Record<string, unknown>[];

    yield batch;

    // move cursor forward
    currentId = rows[rows.length - 1].ID as number;
  }
}

// Write a code to list tables in a mysql database

const listTables = async () => {
  try {
    const pool = getMysqlPool();

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SHOW TABLES LIKE '%wp_posts%'`,
    );

    // Extract table names (column name is dynamic: Tables_in_<db>)
    const tableNames = rows.map((row) => Object.values(row)[0]);

    return tableNames;
  } catch (err: any) {
    console.error("Error fetching tables", { error: err?.message });
  } finally {
    // await closeWordpressMysqlPool();
  }
};

// Add condition to filter by post_type = 'footprint'
const FOOTPRINT_POST_TYPE = 'plastic_footprint';
export async function* listFootPrints(
  lastSeenId: number = 0,
  batchSize: number = 5,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();

  let currentId = Math.max(0, Number(lastSeenId) || 0);
  const limit = Math.max(1, Number(batchSize) || 5);

  while (true) {
    if (currentId >= ID_CAP) break;
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM \`${MIGRATION_TABLE.WORDPRESS.WP_POSTS}\`
      WHERE ID > ? AND post_type = '${FOOTPRINT_POST_TYPE}'
      ORDER BY ID ASC
      LIMIT ${limit}
      `,
      [currentId],
    );

    const batch = rows as Record<string, unknown>[];

    if (batch.length === 0) break;
    yield batch;
    currentId = batch[batch.length - 1].ID as number;
  }
}

/**
 * One pre-pass over all `plastic_footprint` posts (within `ID_CAP`): deterministic
 * `attemptNumber` per normalized email, ordered by `post_date` then `ID`.
 * See `buildAttemptNumberByPostId` in `transformers/footprint-attempt.ts`.
 */
export async function loadFootprintAttemptNumberByPostId(): Promise<
  Map<number, number>
> {
  const pool = getMysqlPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `
    SELECT ID, post_date, post_title, post_content
    FROM \`${MIGRATION_TABLE.WORDPRESS.WP_POSTS}\`
    WHERE post_type = ? AND ID > 0 AND ID <= ?
    `,
    [FOOTPRINT_POST_TYPE, ID_CAP],
  );
  const list = (Array.isArray(rows) ? rows : []) as FootprintAttemptRow[];
  return buildAttemptNumberByPostId(list);
}

/**
 * Full scan of affiliate rows: WordPress `user_id` → advisor active flag.
 * `true` only when any row for that user has `status` equal to `active` (case-insensitive, trimmed).
 * Multiple rows per user use OR semantics; only `true` is stored so an active row is never overwritten by inactive.
 */
export async function loadAffiliateAdvisorActiveByWpUserId(): Promise<
  Map<number, boolean>
> {
  const pool = getMysqlPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `
    SELECT user_id, status
    FROM \`${MIGRATION_TABLE.WORDPRESS.AFFILIATES}\`
    `,
  );

  const byWpUserId = new Map<number, boolean>();
  const list = Array.isArray(rows) ? rows : [];

  for (const row of list) {
    const wpUserId = Number(row.user_id);
    if (!Number.isFinite(wpUserId) || wpUserId <= 0) continue;

    const statusRaw = row.status;
    const normalized = String(statusRaw ?? "")
      .trim()
      .toLowerCase();
    if (normalized === AFFILIATE_STATUS_ACTIVE) {
      byWpUserId.set(wpUserId, true);
    }
  }

  return byWpUserId;
}

/**
 * Batch-load `footprint_score` postmeta for the given post IDs (one query per call).
 * If multiple rows exist for the same post_id, the last row in the result set wins.
 */
export async function getFootprintScoresByPostIds(
  postIds: number[],
): Promise<Map<number, number>> {
  const byPostId = new Map<number, number>();
  const ids = postIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return byPostId;

  const pool = getMysqlPool();
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `
    SELECT post_id, meta_value
    FROM \`${MIGRATION_TABLE.WORDPRESS.POSTMETA}\`
    WHERE meta_key = ?
      AND post_id IN (${placeholders})
    `,
    [FOOTPRINT_SCORE_META_KEY, ...ids],
  );

  for (const row of rows) {
    const postId = Number(row.post_id);
    if (!Number.isFinite(postId) || postId <= 0) continue;
    const raw = row.meta_value;
    const parsed =
      typeof raw === "string" ? parseFloat(raw.trim()) : Number(raw);
    if (Number.isFinite(parsed)) byPostId.set(postId, parsed);
  }

  return byPostId;
}