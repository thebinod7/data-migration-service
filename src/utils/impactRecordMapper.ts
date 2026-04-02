import { randomBytes } from "node:crypto";

import type { CampaignRecipientSourceRow } from "../extractors/certificate_app";
import { parseDateToTimestamp } from "./utils";

/** Laravel `campaign_type_id` → Convex program id (replace with real Convex ids). */
const PROGRAM_ID_BY_LARAVEL_TYPE: Record<number, string> = {
  1: "k57abc123program_placeholder_01",
  2: "k57abc123program_placeholder_02",
};

/** Laravel `image_template_id` → Convex template id (replace with real Convex ids). */
const TEMPLATE_ID_BY_LARAVEL: Record<number, string> = {
  1: "k57abc123template_placeholder_01",
  2: "k57abc123template_placeholder_02",
};

const DEFAULT_PROGRAM_ID = "k57abc123program_default";
const DEFAULT_TEMPLATE_ID = "k57abc123template_default";

const FAILED_STATUS = new Set(["failed", "failure", "cancelled", "canceled"]);

export const IMPACT_RECORD_PRESETUP = {
  programIdByLaravelCampaignTypeId: PROGRAM_ID_BY_LARAVEL_TYPE,
  templateIdByLaravelImageTemplateId: TEMPLATE_ID_BY_LARAVEL,
  defaultProgramId: DEFAULT_PROGRAM_ID,
  defaultTemplateId: DEFAULT_TEMPLATE_ID,
} as const;

export type ImpactRecordConvexRow = {
  impactId: string;
  accountId: string;
  impactAmount: number;
  impactRegion: string;
  programId: string;
  templateId: string;
  source: string;
  state: string;
  attributionStatus: "assigned" | "unclaimed";
  certificateNameOverride: string;
  orderId: string;
  originalEmail: string;
  purchaserEmail: string;
  createdAt: number;
};

export type MapImpactRecordsContext = {
  emailToUserId: Map<string, string>;
  /** migration.md §2 — return Convex account id, or `null` to skip the row. */
  resolveAccountId: (input: {
    recipient: Record<string, unknown>;
    campaign: Record<string, unknown> | null;
  }) => string | null;
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isFailedStatus(status: unknown): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return FAILED_STATUS.has(s);
}

function impactIdForRow(createdAtMs: number): string {
  const year = new Date(createdAtMs).getFullYear();
  const suffix = randomBytes(5).toString("hex");
  return `ID-${year}-${suffix}`;
}

function lookupProgramId(campaign: Record<string, unknown> | null): string {
  const typeId = Number(campaign?.campaign_type_id);
  if (Number.isFinite(typeId) && typeId > 0) {
    return (
      PROGRAM_ID_BY_LARAVEL_TYPE[typeId] ?? DEFAULT_PROGRAM_ID
    );
  }
  return DEFAULT_PROGRAM_ID;
}

function lookupTemplateId(campaign: Record<string, unknown> | null): string {
  const templateId = Number(campaign?.image_template_id);
  if (Number.isFinite(templateId) && templateId > 0) {
    return TEMPLATE_ID_BY_LARAVEL[templateId] ?? DEFAULT_TEMPLATE_ID;
  }
  return DEFAULT_TEMPLATE_ID;
}

/** Best-effort region from meta rows (key/value shapes vary by schema). */
function impactRegionFromMetas(metas: Record<string, unknown>[]): string | undefined {
  for (const m of metas) {
    const direct = m.region ?? m.impact_region ?? m.slug;
    if (direct != null && String(direct).trim() !== "") {
      return String(direct).trim();
    }
    const key = String(m.key ?? m.meta_key ?? m.name ?? "")
      .trim()
      .toLowerCase();
    const val = m.value ?? m.meta_value;
    if (val != null && String(val).trim() !== "") {
      if (
        key.includes("region") ||
        key.includes("slug") ||
        key === "country" ||
        key === "impact_region"
      ) {
        return String(val).trim();
      }
    }
  }
  return undefined;
}

function resolveImpactRegion(
  campaign: Record<string, unknown> | null,
  metas: Record<string, unknown>[],
): string {
  const slug = campaign?.slug;
  if (slug != null && String(slug).trim() !== "") {
    return String(slug).trim();
  }
  const fromMeta = impactRegionFromMetas(metas);
  if (fromMeta) return fromMeta;
  return "PH";
}

function buildSource(
  recipient: Record<string, unknown>,
  campaign: Record<string, unknown> | null,
): string {
  const partA = String(recipient.source ?? "").trim();
  const sub =
    recipient.subscription_type ?? campaign?.subscription_type ?? "";
  const partB = String(sub).trim();
  return `${partA}${partB}`;
}

/**
 * Maps enriched Laravel rows to Convex-ready impact records (migration.md §6).
 * Skips rows with failed recipient status or unresolved `accountId`.
 */
export function mapEnrichedRecipientsToImpactRecords(
  enriched: CampaignRecipientSourceRow[],
  ctx: MapImpactRecordsContext,
): ImpactRecordConvexRow[] {
  const out: ImpactRecordConvexRow[] = [];

  for (const { recipient, campaign, metas } of enriched) {
    if (isFailedStatus(recipient.status)) continue;

    const accountId = ctx.resolveAccountId({ recipient, campaign });
    if (!accountId) continue;

    const createdAt = parseDateToTimestamp(String(recipient.created_at ?? ""));
    const purchaserEmailRaw = normalizeEmail(recipient.email);
    const attributionStatus: "assigned" | "unclaimed" =
      purchaserEmailRaw !== "" && ctx.emailToUserId.has(purchaserEmailRaw)
        ? "assigned"
        : "unclaimed";

    const impactKg = Number(recipient.impact_kg);
    const impactAmount = Number.isFinite(impactKg) ? impactKg : 0;

    out.push({
      impactId: impactIdForRow(createdAt),
      accountId,
      impactAmount,
      impactRegion: resolveImpactRegion(campaign, metas),
      programId: lookupProgramId(campaign),
      templateId: lookupTemplateId(campaign),
      source: buildSource(recipient, campaign),
      state: String(recipient.status ?? ""),
      attributionStatus,
      certificateNameOverride: String(recipient.name ?? ""),
      orderId: String(recipient.order_id ?? ""),
      originalEmail: String(recipient.origin_email ?? ""),
      purchaserEmail: String(recipient.email ?? ""),
      createdAt,
    });
  }

  return out;
}
