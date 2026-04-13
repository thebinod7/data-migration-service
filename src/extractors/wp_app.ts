import mysql from "mysql2/promise";
import { config } from "../config";
import { MIGRATION_TABLE } from "../config/tables";
import { AFFILIATE_STATUS_ACTIVE, ID_CAP } from "../constants/contants";
import {
  buildAttemptNumberByPostId,
  type FootprintAttemptRow,
} from "../transformers/footprint-attempt";

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

/** Raw `meta_value` strings from `76a_postmeta` for `score` / `action` keys (after `meta_id` dedupe). */
export type FootprintPostMetaByPostId = {
  score?: string;
  action?: string;
};

type FootprintPostMetaDedupe = {
  score?: string;
  scoreMetaId: number;
  action?: string;
  actionMetaId: number;
};

/**
 * Batched read of WordPress postmeta for footprint calculator fields.
 * Duplicate rows per `(post_id, meta_key)` resolve to the row with the largest `meta_id`.
 */
export async function fetchFootprintPostMetaForPostIds(
  postIds: readonly number[],
): Promise<Map<number, FootprintPostMetaByPostId>> {
  const out = new Map<number, FootprintPostMetaByPostId>();
  const ids = [...new Set(postIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return out;

  const pool = getMysqlPool();
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `
    SELECT meta_id, post_id, meta_key, meta_value
    FROM \`${MIGRATION_TABLE.WORDPRESS.POSTMETA}\`
    WHERE post_id IN (${placeholders})
      AND meta_key IN ('score', 'action')
    `,
    ids,
  );

  const list = Array.isArray(rows) ? rows : [];
  const dedupe = new Map<number, FootprintPostMetaDedupe>();

  const metaValueToString = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Buffer.isBuffer(v)) return v.toString("utf8");
    return String(v);
  };

  for (const row of list) {
    const postId = Number(row.post_id);
    if (!Number.isFinite(postId) || postId <= 0) continue;

    const metaKey = String(row.meta_key ?? "");
    if (metaKey !== "score" && metaKey !== "action") continue;

    const metaId = Number(row.meta_id);
    const metaIdSafe = Number.isFinite(metaId) ? metaId : 0;
    const metaValue = metaValueToString(row.meta_value);

    let slot = dedupe.get(postId);
    if (!slot) {
      slot = { scoreMetaId: -1, actionMetaId: -1 };
      dedupe.set(postId, slot);
    }

    if (metaKey === "score" && metaIdSafe >= slot.scoreMetaId) {
      slot.scoreMetaId = metaIdSafe;
      slot.score = metaValue;
    } else if (metaKey === "action" && metaIdSafe >= slot.actionMetaId) {
      slot.actionMetaId = metaIdSafe;
      slot.action = metaValue;
    }
  }

  for (const [postId, slot] of dedupe) {
    const entry: FootprintPostMetaByPostId = {};
    if (slot.score !== undefined) entry.score = slot.score;
    if (slot.action !== undefined) entry.action = slot.action;
    if (entry.score !== undefined || entry.action !== undefined) {
      out.set(postId, entry);
    }
  }

  return out;
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

