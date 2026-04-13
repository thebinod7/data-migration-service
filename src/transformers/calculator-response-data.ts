import { type FootprintAttemptRow } from "./footprint-attempt";
import { parseDateToTimestamp } from "../utils/utils";

/**
 * Maps WordPress `plastic_footprint` posts into Convex `calculatorResponses`-shaped
 * fields (excluding `userId` / `accountId`, resolved in migration).
 *
 * - Email for grouping is handled in `footprint-attempt.ts`; this module parses JSON,
 *   routes answers vs demographics vs SDGs, and derives status / pages / timestamps.
 * - Timestamps prefer `post_date`, then `post_modified` (do not rely on `post_date_gmt`).
 */

export type PlasticFootprintPostRow = FootprintAttemptRow & {
  post_modified?: unknown;
};

export type CalculatorCountrySnapshot = {
  code: string;
  title: string;
  averageKg: number;
};

export type CalculatorScoreByPage = {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
};

export type CalculatorDemographics = {
  age?: string;
  gender?: string;
  occupation?: string;
};

/** Convex calculator row without identity fields (migration adds `userId`, `accountId`). */
export type CalculatorResponsePayload = {
  attemptNumber: number;
  country?: CalculatorCountrySnapshot;
  preferenceId?: string;
  answers: Record<string, string>;
  scoreTotal?: number;
  scoreBase?: number;
  scoreByPage?: CalculatorScoreByPage;
  demographics?: CalculatorDemographics;
  newsletterOptIn?: boolean;
  sdgPersonal?: string[];
  sdgPlanet?: string[];
  referredBy?: string;
  currentPage: string;
  status: "in_progress" | "completed";
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

const KEYS_EXCLUDED_FROM_ANSWERS = new Set([
  "email",
  "countries",
  "country",
  "preference_type",
  "preferenceType",
  "sdg_personal",
  "sdg_planet",
  "sdgPersonal",
  "sdgPlanet",
  "referred_by",
  "referredBy",
  "user_age",
  "user_gender",
  "user_occupation",
  "score_base",
  "scoreBase",
  "score_by_page",
  "scoreByPage",
  "footprint_score",
  "current_page",
  "currentPage",
  "page",
  "newsletter_opt_in",
  "newsletterOptIn",
  "newsletter",
]);

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
    /* invalid JSON — caller quarantines */
  }
  return null;
}

function mysqlDateToMs(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const t = parseDateToTimestamp(String(value ?? ""));
  return Number.isFinite(t) ? t : null;
}

/** Prefer first field that yields a finite positive ms (post_date before fallbacks). */
function firstPositiveTimestampMs(
  row: PlasticFootprintPostRow,
  keys: (keyof PlasticFootprintPostRow)[],
): number {
  for (const k of keys) {
    const ms = mysqlDateToMs(row[k]);
    if (ms !== null && ms > 0) return ms;
  }
  return 0;
}

function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** WordPress `postmeta.meta_value` for `score` — same coercion as JSON `footprint_score` paths. */
export function resolveScoreTotalFromMeta(value: unknown): number | undefined {
  return coerceFiniteNumber(value);
}

/** WordPress `postmeta.meta_value` for `action` — trimmed non-empty string, or finite number as string. */
export function resolveCurrentPageFromMeta(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return t !== "" ? t : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function parseCountryFromJson(obj: Record<string, unknown>): CalculatorCountrySnapshot | undefined {
  const raw = obj.countries ?? obj.country;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const code =
    o.ID != null
      ? String(o.ID).trim()
      : o.code != null
        ? String(o.code).trim()
        : "";
  const title =
    typeof o.title === "string"
      ? o.title.trim()
      : String(o.title ?? "").trim();
  const avgRaw = o.average_kg ?? o.averageKg;
  const averageKg =
    typeof avgRaw === "number" ? avgRaw : Number(avgRaw ?? Number.NaN);
  if (!code || !title || !Number.isFinite(averageKg)) return undefined;
  return { code, title, averageKg };
}

function parseScoreByPage(raw: unknown): CalculatorScoreByPage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const keys = ["q1", "q2", "q3", "q4", "q5"] as const;
  const out: Partial<CalculatorScoreByPage> = {};
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    out[k] = n;
  }
  return out as CalculatorScoreByPage;
}

function stringArrayFromJson(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const strings = value.map((x) => String(x));
  return strings.length ? strings : undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return undefined;
}

function stringifyAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildAnswers(obj: Record<string, unknown>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (KEYS_EXCLUDED_FROM_ANSWERS.has(key)) continue;
    answers[key] = stringifyAnswerValue(value);
  }
  return answers;
}

function buildDemographics(obj: Record<string, unknown>): CalculatorDemographics | undefined {
  const age =
    typeof obj.user_age === "string"
      ? obj.user_age.trim()
      : obj.user_age != null
        ? String(obj.user_age)
        : undefined;
  const gender =
    typeof obj.user_gender === "string"
      ? obj.user_gender.trim()
      : obj.user_gender != null
        ? String(obj.user_gender)
        : undefined;
  const occupation =
    typeof obj.user_occupation === "string"
      ? obj.user_occupation.trim()
      : obj.user_occupation != null
        ? String(obj.user_occupation)
        : undefined;
  if (!age && !gender && !occupation) return undefined;
  const d: CalculatorDemographics = {};
  if (age) d.age = age;
  if (gender) d.gender = gender;
  if (occupation) d.occupation = occupation;
  return d;
}

function inferCurrentPageFromJson(
  obj: Record<string, unknown>,
  status: "in_progress" | "completed",
): string {
  if (status === "completed") return "results";
  const p =
    obj.current_page ?? obj.currentPage ?? obj.page ?? obj.step ?? obj.last_page;
  if (typeof p === "string" && p.trim()) return p.trim();
  if (typeof p === "number" && Number.isFinite(p)) return String(p);
  return "unknown";
}

/**
 * Parses `post_content` JSON and maps routed fields. Returns `null` if JSON is missing
 * or not an object (row should be skipped or quarantined).
 *
 * `scoreTotalFromMeta` is the raw `meta_value` for WordPress `meta_key` `score` when available.
 * `currentPageFromMeta` is the raw `meta_value` for `action`.
 * `status` is `completed` when any finite total is present (meta first via
 * {@link resolveScoreTotalFromMeta}, then JSON keys `footprint_score` / `score_total` / `scoreTotal`).
 * `currentPage` prefers {@link resolveCurrentPageFromMeta}, else {@link inferCurrentPageFromJson}.
 */
export function parseFootprintPostToCalculatorPayload(
  row: PlasticFootprintPostRow,
  options: {
    attemptNumber: number;
    scoreTotalFromMeta?: unknown;
    currentPageFromMeta?: unknown;
  },
): CalculatorResponsePayload | null {
  const obj = tryParseJsonObject(stringFromPostContent(row.post_content));
  if (!obj) return null;

  const scoreFromMeta = resolveScoreTotalFromMeta(options.scoreTotalFromMeta);
  const scoreFromJson = coerceFiniteNumber(
    obj.footprint_score ?? obj.score_total ?? obj.scoreTotal,
  );
  const scoreTotal = scoreFromMeta ?? scoreFromJson;

  const status: "in_progress" | "completed" =
    scoreTotal !== undefined ? "completed" : "in_progress";

  const createdAt = firstPositiveTimestampMs(row, ["post_date", "post_modified"]);
  const updatedAt = firstPositiveTimestampMs(row, ["post_modified", "post_date"]);

  const completedAt =
    status === "completed"
      ? firstPositiveTimestampMs(row, ["post_date", "post_modified"]) || undefined
      : undefined;

  const preferenceRaw = obj.preference_type ?? obj.preferenceType;
  const preferenceId =
    typeof preferenceRaw === "string" && preferenceRaw.trim()
      ? preferenceRaw.trim()
      : undefined;

  const referredRaw = obj.referred_by ?? obj.referredBy;
  const referredBy =
    typeof referredRaw === "string" && referredRaw.trim()
      ? referredRaw.trim()
      : undefined;

  const newsletterOptIn = coerceBoolean(
    obj.newsletter_opt_in ?? obj.newsletterOptIn ?? obj.newsletter,
  );

  const sdgPersonal = stringArrayFromJson(obj.sdg_personal ?? obj.sdgPersonal);
  const sdgPlanet = stringArrayFromJson(obj.sdg_planet ?? obj.sdgPlanet);

  const country = parseCountryFromJson(obj);
  const scoreBase = country?.averageKg ?? 0;
  const scoreByPage = parseScoreByPage(obj.score_by_page ?? obj.scoreByPage);
  const demographics = buildDemographics(obj);
  const answers = buildAnswers(obj);

  return {
    attemptNumber: options.attemptNumber,
    ...(country ? { country } : {}),
    ...(preferenceId ? { preferenceId } : {}),
    answers,
    ...(scoreTotal !== undefined ? { scoreTotal } : {}),
    scoreBase,
    ...(scoreByPage ? { scoreByPage } : {}),
    ...(demographics ? { demographics } : {}),
    ...(newsletterOptIn !== undefined ? { newsletterOptIn } : {}),
    ...(sdgPersonal ? { sdgPersonal } : {}),
    ...(sdgPlanet ? { sdgPlanet } : {}),
    ...(referredBy ? { referredBy } : {}),
    currentPage:
      resolveCurrentPageFromMeta(options.currentPageFromMeta) ??
      inferCurrentPageFromJson(obj, status),
    status,
    ...(completedAt !== undefined && completedAt > 0 ? { completedAt } : {}),
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}
