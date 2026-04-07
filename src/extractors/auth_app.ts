import { Pool } from "pg";
import { config } from "../config";
import { MIGRATION_TABLE } from "../config/tables";

let authPool: Pool | null = null;

export function getAuthPgPool(): Pool {
  if (!authPool) {
    authPool = new Pool({
      connectionString: config.auth_db.url,
      max: 10,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 5000,
    });
  }
  return authPool;
}

export async function closeAuthPgPool(): Promise<void> {
  if (authPool) {
    await authPool.end();
    authPool = null;
  }
}

/** Canonical form for matching Auth `tbl_users` rows to WordPress `user_email`. */
export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

type CuidRow = { norm_email: string; cuid: string };

/**
 * Batch lookup: normalized email → Auth `cuid`. One round-trip per call.
 * Emails with no row in Auth are omitted (callers may fall back to `wp-*`).
 * If multiple rows share an email, the row with lexicographically greatest `cuid` wins (deterministic).
 */
export async function fetchCuidByEmails(
  emails: string[],
): Promise<Map<string, string>> {
  const normalized = new Set<string>();
  for (const e of emails) {
    const key = normalizeAuthEmail(e);
    if (key.length > 0) {
      normalized.add(key);
    }
  }
  const unique = [...normalized];
  if (unique.length === 0) {
    return new Map();
  }

  const pool = getAuthPgPool();
  const table = MIGRATION_TABLE.AUTH.USERS;

  const { rows } = await pool.query<CuidRow>(
    `
    SELECT DISTINCT ON (lower(trim(email)))
      lower(trim(email)) AS norm_email,
      cuid::text AS cuid
    FROM ${table}
    WHERE lower(trim(email)) = ANY($1::text[])
    ORDER BY lower(trim(email)), cuid DESC
    `,
    [unique],
  );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.norm_email && row.cuid) {
      map.set(row.norm_email, row.cuid);
    }
  }
  return map;
}
