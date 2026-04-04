import type { CampaignRecipientSourceRow } from "../extractors/certificate_app";
import { contributionKindFromCampaignTypeId } from "./campaignContributionKind";
import {
  mapBusinessImpactPageToProfile,
  mapPersonalImpactPageToProfile,
  type ImpactPageProfileFields,
} from "./impactPageProfileMappers";
import { generateSlug, parseDateToTimestamp } from "./utils";

/** Minimal context needed to resolve Laravel recipient → Convex user id. */
export type FallbackAccountsMigrationCtx = {
  emailToUserId: Map<string, string>;
  wpIdToUserId: Map<number, string>;
};

/** Convex `bulkInsertImpactAccounts` payload row (same shape as other migrations). */
export type FallbackImpactAccountRecord = {
  ownerId: string;
  type: "personal" | "business";
  name: string;
  slug: string;
  isDefault: boolean;
  onboardingCompleted: boolean;
  isActiveAdvisor: boolean;
  createdAt: number;
  updatedAt: number;
  profile: ImpactPageProfileFields;
};

/** User-facing fields for naming a minimal default personal account (e.g. WordPress stragglers). */
export type MinimalPersonalAccountMeta = {
  email?: string;
  firstName?: string;
  lastName?: string;
};

/**
 * Tracks accounts created by the fallback migration in this process (across batches).
 * Does not reflect accounts from `migratePersonalAccounts` / `migrateBusinessAccounts`;
 * run those first to avoid duplicate defaults when possible.
 */
const personalAccountIdByOwner = new Map<string, string>();
const businessAccountIdsByOwner = new Map<string, string[]>();

export function resolveOwnerIdForCampaignRecipient(
  recipient: Record<string, unknown>,
  c: FallbackAccountsMigrationCtx,
): string | null {
  const wpUserId = Number(recipient.user_id);
  if (Number.isFinite(wpUserId) && wpUserId > 0) {
    const userId = c.wpIdToUserId.get(wpUserId);
    if (userId) return userId;
  }
  const email = String(recipient.email ?? "")
    .trim()
    .toLowerCase();
  if (email) {
    const userId = c.emailToUserId.get(email);
    if (userId) return userId;
  }
  return null;
}

function fallbackDisplayName(recipient: Record<string, unknown>): string {
  const fromName = String(recipient.name ?? "").trim();
  if (fromName) return fromName;
  const fromSender = String(recipient.sender_name ?? "").trim();
  if (fromSender) return fromSender;
  const email = String(recipient.email ?? "").trim();
  const local = email.split("@")[0] ?? "";
  return local || "Customer";
}

function slugTail(ownerId: string): string {
  return ownerId.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "user";
}

function displayNameFromMinimalMeta(meta: MinimalPersonalAccountMeta): string {
  const first = String(meta.firstName ?? "").trim();
  const last = String(meta.lastName ?? "").trim();
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) return combined;
  const email = String(meta.email ?? "").trim();
  const local = email.split("@")[0] ?? "";
  if (local) return local;
  return "Personal Account";
}

/**
 * One default personal impact row for Convex `bulkInsertImpactAccounts`, matching
 * fallback personal drafts (`queuePersonalDraft`): slug = `generateSlug(name)` + `slugTail`,
 * empty personal profile map, same flags and timestamps pattern (here both times use `now`
 * when no source `created_at` exists).
 */
export function buildMinimalPersonalImpactAccount(
  ownerId: string,
  meta: MinimalPersonalAccountMeta,
): FallbackImpactAccountRecord {
  const displayName = displayNameFromMinimalMeta(meta);
  const name = displayName.trim() || "Personal Account";
  const base = generateSlug(name);
  const now = Date.now();
  return {
    ownerId,
    type: "personal",
    name,
    slug: `${base}-${slugTail(ownerId)}`,
    isDefault: true,
    onboardingCompleted: true,
    isActiveAdvisor: false,
    createdAt: now,
    updatedAt: now,
    profile: mapPersonalImpactPageToProfile({}),
  };
}

function hasPersonalFromFallback(ownerId: string): boolean {
  return personalAccountIdByOwner.has(ownerId);
}

function hasBusinessFromFallback(ownerId: string): boolean {
  return (businessAccountIdsByOwner.get(ownerId)?.length ?? 0) > 0;
}

function queuePersonalDraft(
  ownerId: string,
  recipient: Record<string, unknown>,
  drafts: Map<string, FallbackImpactAccountRecord>,
): void {
  if (hasPersonalFromFallback(ownerId) || drafts.has(ownerId)) return;
  const displayName = fallbackDisplayName(recipient);
  const name = displayName.trim() || "Personal Account";
  const base = generateSlug(name);
  const createdAt = parseDateToTimestamp(String(recipient.created_at ?? ""));
  const ts = Number.isFinite(createdAt) ? createdAt : Date.now();
  const now = Date.now();
  drafts.set(ownerId, {
    ownerId,
    type: "personal",
    name,
    slug: `${base}-${slugTail(ownerId)}`,
    isDefault: true,
    onboardingCompleted: true,
    isActiveAdvisor: false,
    createdAt: ts,
    updatedAt: now,
    profile: mapPersonalImpactPageToProfile({}),
  });
}

function queueBusinessDraft(
  ownerId: string,
  recipient: Record<string, unknown>,
  drafts: Map<string, FallbackImpactAccountRecord>,
): void {
  if (hasBusinessFromFallback(ownerId) || drafts.has(ownerId)) return;
  const displayName = fallbackDisplayName(recipient);
  const name = displayName.trim() || "Business Account";
  const base = generateSlug(name || "business");
  const createdAt = parseDateToTimestamp(String(recipient.created_at ?? ""));
  const ts = Number.isFinite(createdAt) ? createdAt : Date.now();
  const now = Date.now();
  drafts.set(ownerId, {
    ownerId,
    type: "business",
    name,
    slug: `${base}-biz-${slugTail(ownerId)}`,
    isDefault: true,
    onboardingCompleted: true,
    isActiveAdvisor: false,
    createdAt: ts,
    updatedAt: now,
    profile: mapBusinessImpactPageToProfile({}),
  });
}

/**
 * Builds account rows to insert for one enriched batch. Uses `campaign_type_id`
 * (via `contributionKindFromCampaignTypeId`): business → default business account;
 * personal/other → default personal (per migration.md for unclear types).
 */
export function buildFallbackImpactAccountRecordsForBatch(
  enriched: CampaignRecipientSourceRow[],
  c: FallbackAccountsMigrationCtx,
): FallbackImpactAccountRecord[] {
  const personalDrafts = new Map<string, FallbackImpactAccountRecord>();
  const businessDrafts = new Map<string, FallbackImpactAccountRecord>();

  for (const { recipient, campaign } of enriched) {
    const ownerId = resolveOwnerIdForCampaignRecipient(recipient, c);
    if (!ownerId) continue;

    const kind = contributionKindFromCampaignTypeId(campaign?.campaign_type_id);
    if (kind === "business") {
      queueBusinessDraft(ownerId, recipient, businessDrafts);
    } else {
      queuePersonalDraft(ownerId, recipient, personalDrafts);
    }
  }

  return [...personalDrafts.values(), ...businessDrafts.values()];
}

/**
 * After `bulkInsertImpactAccounts`, register created ids so later batches skip duplicates.
 * `insertResults` order must match `recordsSent` (Convex handler uses same order).
 */
export function registerFallbackAccountsFromInsertResults(
  recordsSent: FallbackImpactAccountRecord[],
  insertResults: { ownerId: string; accountId: string }[],
): void {
  for (let i = 0; i < recordsSent.length; i++) {
    const sent = recordsSent[i]!;
    const res = insertResults[i];
    const accountId = res?.accountId;
    if (!accountId) continue;

    if (sent.type === "personal") {
      personalAccountIdByOwner.set(sent.ownerId, accountId);
    } else {
      const list = businessAccountIdsByOwner.get(sent.ownerId) ?? [];
      if (!list.includes(accountId)) list.push(accountId);
      businessAccountIdsByOwner.set(sent.ownerId, list);
    }
  }
}
