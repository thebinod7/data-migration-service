import type {
  AccountProfileDisplayUnit,
  AccountProfileSectionOrder,
  AccountProfileVisibility,
} from "../accountProfileConvexSchema";


export const IMPACT_PAGE_MYSQL_COLUMNS = {
  page_status: "page_status",
  display_status: "display_status",
  cta_url: "cta_url",
  invite_url: "invite_url",
} as const;

const loggedUnknownBusinessPageStatuses = new Set<string>();

/** Profile fields Convex expects (before `accountId` is set at insert time). */
export type ImpactPageProfileFields = {
  visibility: AccountProfileVisibility;
  displayUnit: AccountProfileDisplayUnit;
  sectionOrder: AccountProfileSectionOrder;
  ctaUrl: string;
  inviteUrl: string;
  logoId: string | undefined;
  wordmarkId: string | undefined;
};

function firstDefinedString(
  row: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function rawPageStatus(row: Record<string, unknown>): string {
  return firstDefinedString(row, [
    IMPACT_PAGE_MYSQL_COLUMNS.page_status,
    "pageStatus",
  ]).trim();
}

/**
 * Map Laravel `impact_pages.page_status` to Convex `visibility`.
 * Unknown values default to `"private"`; each distinct raw value is logged once.
 */
export function normalizeVisibilityBusiness(
  raw: string | null | undefined,
): AccountProfileVisibility {
  const key = String(raw ?? "").trim();
  const upper = key.toUpperCase();

  const map: Record<string, AccountProfileVisibility> = {
    LIVE: "public",
    PUBLIC: "public",
    PUBLISHED: "public",
    DRAFT: "private",
    PRIVATE: "private",
    UNLISTED: "private",
    HIDDEN: "private",
  };

  if (upper in map) return map[upper]!;

  if (key !== "" && !loggedUnknownBusinessPageStatuses.has(key)) {
    loggedUnknownBusinessPageStatuses.add(key);
    console.warn(
      "[migration] Unknown impact_pages.page_status; defaulting to private:",
      key,
    );
  }
  return "private";
}

/** `page_status === "LIVE"` (case-insensitive) → public, else private. */
export function normalizeVisibilityPersonal(
  pageStatus: string | null | undefined,
): AccountProfileVisibility {
  return String(pageStatus ?? "").trim().toUpperCase() === "LIVE"
    ? "public"
    : "private";
}

/**
 * Map Laravel `display_status` strings to Convex `displayUnit` literals (`Kg` capital K).
 */
export function normalizeDisplayUnit(
  raw: string | null | undefined,
): AccountProfileDisplayUnit {
  const n = String(raw ?? "").trim().toLowerCase();

  if (n === "kg" || n === "kgs" || n === "kilogram" || n === "kilograms")
    return "Kg";
  if (n === "lb" || n === "lbs" || n === "pound" || n === "pounds") return "Lbs";
  if (n === "bottle" || n === "bottles") return "Bottles";

  return "Kg";
}

export function mapBusinessImpactPageToProfile(
  row: Record<string, unknown>,
): ImpactPageProfileFields {
  const visibility = normalizeVisibilityBusiness(rawPageStatus(row));
  const displayUnit = normalizeDisplayUnit(
    firstDefinedString(row, [
      IMPACT_PAGE_MYSQL_COLUMNS.display_status,
      "displayStatus",
    ]) || undefined,
  );
  const ctaUrl = firstDefinedString(row, [
    IMPACT_PAGE_MYSQL_COLUMNS.cta_url,
    "ctaUrl",
  ]);
  const inviteUrl = firstDefinedString(row, [
    IMPACT_PAGE_MYSQL_COLUMNS.invite_url,
    "inviteUrl",
  ]);

  return {
    visibility,
    displayUnit,
    sectionOrder: [],
    ctaUrl,
    inviteUrl,
    logoId: undefined,
    wordmarkId: undefined,
  };
}

export function mapPersonalImpactPageToProfile(
  row: Record<string, unknown>,
): ImpactPageProfileFields {
  const visibility = normalizeVisibilityPersonal(rawPageStatus(row));
  const displayUnit = normalizeDisplayUnit(
    firstDefinedString(row, [
      IMPACT_PAGE_MYSQL_COLUMNS.display_status,
      "displayStatus",
    ]) || undefined,
  );
  const inviteUrl = firstDefinedString(row, [
    IMPACT_PAGE_MYSQL_COLUMNS.invite_url,
    "inviteUrl",
  ]);

  return {
    visibility,
    displayUnit,
    sectionOrder: [],
    ctaUrl: "",
    inviteUrl,
    logoId: undefined,
    wordmarkId: undefined,
  };
}
