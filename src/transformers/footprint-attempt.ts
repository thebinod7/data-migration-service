import { parseDateToTimestamp } from "../utils/utils";

/**
 * Deterministic `attemptNumber` for plastic_footprint posts:
 * - Partition key: normalized email from (1) `post_title` `_new_{email}_` pattern, else (2) `email` in parsed `post_content` JSON.
 *   Rows with no key use `__unkeyed__:<postId>` so each is its own sequence of length 1.
 * - Order within a partition: `post_date` ascending, then `ID` ascending (tie-break).
 * - Reruns are stable as long as source rows and this derivation stay the same (documented pre-pass, not SQL window).
 */

export type FootprintAttemptRow = {
  ID: unknown;
  post_date: unknown;
  post_title?: unknown;
  post_content?: unknown;
};

/** Match `_new_..._` segments and pull a valid email from the captured text. */
const TITLE_NEW_BLOCK = /_new_(.+?)_/gi;

function stringFromPostContent(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }
  return String(raw ?? "");
}

function tryParseJsonObject(str: string): Record<string, unknown> | null {
  const t = str.trim();
  if (!t.startsWith("{")) return null;
  try {
    const v = JSON.parse(t) as unknown;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* invalid JSON — no email from content */
  }
  return null;
}

function normalizeEmailCandidate(s: string): string | null {
  const e = s.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function extractEmailFromTitle(title: string): string | null {
  TITLE_NEW_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TITLE_NEW_BLOCK.exec(title)) !== null) {
    const segment = m[1]?.trim() ?? "";
    const direct = normalizeEmailCandidate(segment);
    if (direct) return direct;
    const inner = segment.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    if (inner?.[0]) {
      const n = normalizeEmailCandidate(inner[0]);
      if (n) return n;
    }
  }
  return null;
}

/**
 * Canonical email for grouping attempts (title first, then JSON `email`).
 * Returns `null` if neither source yields a normalized email.
 */
export function extractEmailFromFootprintPost(row: FootprintAttemptRow): string | null {
  const fromTitle = extractEmailFromTitle(String(row.post_title ?? ""));
  if (fromTitle) return fromTitle;

  const obj = tryParseJsonObject(stringFromPostContent(row.post_content));
  if (obj) {
    const email = obj.email;
    if (typeof email === "string") {
      const n = normalizeEmailCandidate(email);
      if (n) return n;
    }
  }
  return null;
}

function postDateMs(row: FootprintAttemptRow): number {
  const d = row.post_date;
  if (d instanceof Date) {
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const t = parseDateToTimestamp(String(d ?? ""));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Per-email (or per-`__unkeyed__`) attempt numbers: 1-based in `post_date` order.
 */
export function buildAttemptNumberByPostId(rows: FootprintAttemptRow[]): Map<number, number> {
  const byPostId = new Map<number, number>();
  const entries = rows
    .map((row) => {
      const postId = Number(row.ID);
      const safeId = Number.isFinite(postId) && postId > 0 ? postId : 0;
      const email = extractEmailFromFootprintPost(row);
      const partitionKey = email ?? `__unkeyed__:${safeId}`;
      return {
        postId: safeId,
        partitionKey,
        postDateMs: postDateMs(row),
      };
    })
    .filter((e) => e.postId > 0);

  entries.sort((a, b) => {
    const k = a.partitionKey.localeCompare(b.partitionKey);
    if (k !== 0) return k;
    if (a.postDateMs !== b.postDateMs) return a.postDateMs - b.postDateMs;
    return a.postId - b.postId;
  });

  let lastKey: string | null = null;
  let attempt = 0;
  for (const e of entries) {
    if (e.partitionKey !== lastKey) {
      lastKey = e.partitionKey;
      attempt = 1;
    } else {
      attempt += 1;
    }
    byPostId.set(e.postId, attempt);
  }

  return byPostId;
}
