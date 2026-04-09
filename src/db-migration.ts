import "dotenv/config";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { MIGRATION_TABLE } from "./config/tables";
import {
  closeCertificateMysqlPool,
  enrichCampaignRecipientBatch,
  listBusinessImpactPages,
  listCampaignRecipients,
  listImpactTrialDates,
  listPersonalImpactPages,
} from "./extractors/certificate_app";
import {
  closeAuthPgPool,
  fetchCuidByEmails,
  normalizeAuthEmail,
} from "./extractors/auth_app";
import {
  closeWordpressMysqlPool,
  getFootprintScoresByPostIds,
  listFootPrints,
  listWpUsers,
  loadAffiliateAdvisorActiveByWpUserId,
} from "./extractors/wp_app";
import { getLastPrimaryKey, saveCheckpoint } from "./utils/checkpoint";
import { mapEnrichedRecipientsToImpactRecords } from "./utils/impactRecordMapper";
import {
  mapBusinessImpactPageToProfile,
  mapPersonalImpactPageToProfile,
} from "./utils/impactPageProfileMappers";
import {
  parseFootprintPostToCalculatorPayload,
  type PlasticFootprintPostRow,
} from "./transformers/calculator-response-data";
import {
  extractEmailFromFootprintPost,
  type FootprintAttemptRow,
} from "./transformers/footprint-attempt";
import {
  generateSlug,
  parseDateToTimestamp,
  parseOffsetCheckpoint,
  splitFullName,
} from "./utils/utils";
import { fetchInvitesInBatches, fetchTribeListInBatches } from "./extractors/tribe_app";
import {
  mapInviteFieldsToConvex,
  mapTribeRowsToTribesWithMemberships,
} from "./transformers/tribe-data";
import {
  buildFallbackImpactAccountRecordsForBatch,
  buildMinimalPersonalImpactAccount,
  registerFallbackAccountsFromInsertResults,
  resolveIsActiveAdvisor,
} from "./utils/fallbackCampaignRecipientAccounts";
import { BATCH_SIZE } from "./constants/contants";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

type OwnerAccountKind = "personal" | "business";

const ctx = {
  emailToUserId: new Map<string, string>(),
  wpIdToUserId: new Map<number, string>(),
  userIdToWpId: new Map<string, number>(),
  affiliateActiveByWpUserId: new Map<number, boolean>(),
  userToAccounts: new Map<string, string[]>(),
  ownerAccountTypes: new Map<string, Set<OwnerAccountKind>>(),
  userIdToMeta: new Map<
    string,
    { email: string; firstName: string; lastName: string }
  >(),
};

function registerOwnerAccountType(ownerId: string, type: OwnerAccountKind) {
  let kinds = ctx.ownerAccountTypes.get(ownerId);
  if (!kinds) {
    kinds = new Set();
    ctx.ownerAccountTypes.set(ownerId, kinds);
  }
  kinds.add(type);
}

async function runMigration(): Promise<void> {
  try {
    console.log("🔄 Starting migration...");

    // ---------------- First batch ----------------
    await migrateUsersFromWordpress();
    ctx.affiliateActiveByWpUserId =
      await loadAffiliateAdvisorActiveByWpUserId();
    await migratePersonalAccounts();
    await migrateBusinessAccounts();
    await migrateFallbackAccounts();
    await migrateDefaultPersonalAccountsForStragglers();
    // await migrateTrials();
    // await migrateTribeInvites();
    // await migrateTribeList();
    await migrateImpactRecords();
    // await migrateFootPrints();
    // ---------------- End of first batch ----------------

    console.log("✅ MIGRATION COMPLETED!!!");
  } catch (err: any) {
    console.error("Migration failed!", {
      error: err?.message,
      stack: err?.stack,
    });
    process.exit(1);
  } finally {
    await closeWordpressMysqlPool();
    await closeCertificateMysqlPool();
    await closeAuthPgPool();
  }
}

runMigration();


function resolveInviteAccountId(
  invite: Record<string, unknown>,
): string | null {
  const memberId = Number(invite.memberId);
  if (!Number.isFinite(memberId) || memberId <= 0) return null;
  const convexUserId = ctx.wpIdToUserId.get(memberId);
  if (!convexUserId) return null;
  const accounts = ctx.userToAccounts.get(convexUserId);
  return accounts?.[0] ?? null;
}

/** Tribe leader is the WordPress user in `invitedBy`; map to their primary Convex account. */
function resolveTribeLeaderAccountId(
  tribe: Record<string, unknown>,
): string | null {
  const invitedByWpId = Number(tribe.invitedBy);
  if (!Number.isFinite(invitedByWpId) || invitedByWpId <= 0) return null;
  const convexUserId = ctx.wpIdToUserId.get(invitedByWpId);
  if (!convexUserId) return null;
  const accounts = ctx.userToAccounts.get(convexUserId);
  return accounts?.[0] ?? null;
}

/** Tribe member is the WordPress user in `memberId`; map to their primary Convex account (same as invites). */
function resolveTribeMemberAccountId(
  tribe: Record<string, unknown>,
): string | null {
  const memberId = Number(tribe.memberId);
  if (!Number.isFinite(memberId) || memberId <= 0) return null;
  const convexUserId = ctx.wpIdToUserId.get(memberId);
  if (!convexUserId) return null;
  const accounts = ctx.userToAccounts.get(convexUserId);
  return accounts?.[0] ?? null;
}

async function migrateTribeInvites() {
  const TABLE = MIGRATION_TABLE.TRIBE.INVITES;
  let nextOffset = parseOffsetCheckpoint(getLastPrimaryKey(TABLE));

  for await (const batch of fetchInvitesInBatches({
    limit: BATCH_SIZE,
    initialOffset: nextOffset,
  })) {
    const records = mapInviteFieldsToConvex(batch, resolveInviteAccountId);

    if (records.length > 0) {
      await convex.mutation(api.migrations.bulkInsertReferralCodes, {
        records,
      });
    }

    nextOffset += batch.length;
    // saveCheckpoint(TABLE, nextOffset);

    const skippedThisBatch = batch.length - records.length;
    console.log(
      `[Tribe invites] Inserted ${records.length} into Convex, ${skippedThisBatch} skipped.`,
    );
  }

  console.log("✅ Tribe invites migration done");
}

async function migrateTribeList() {
  const TABLE = MIGRATION_TABLE.TRIBE.TRIBES;
  let nextOffset = parseOffsetCheckpoint(getLastPrimaryKey(TABLE));

  for await (const batch of fetchTribeListInBatches({
    limit: BATCH_SIZE,
    initialOffset: nextOffset,
  })) {
    let skipNoLeader = 0;
    let skipBadDate = 0;
    let skipNoMember = 0;
    for (const tribe of batch) {
      if (!resolveTribeLeaderAccountId(tribe)) {
        skipNoLeader++;
        continue;
      }
      const createdAt = new Date(tribe.createdAt as string | Date).getTime();
      if (!Number.isFinite(createdAt)) {
        skipBadDate++;
        continue;
      }
      if (!resolveTribeMemberAccountId(tribe)) {
        skipNoMember++;
        continue;
      }
    }

    const items = mapTribeRowsToTribesWithMemberships(
      batch,
      resolveTribeLeaderAccountId,
      resolveTribeMemberAccountId,
    );

    if (items.length > 0) {
      await convex.mutation(api.migrations.bulkInsertTribesWithMemberships, {
        items: items as any,
      });
    }

    nextOffset += batch.length;
    saveCheckpoint(TABLE, nextOffset);
    const skippedThisBatch = batch.length - items.length;
    console.log(
      `[Tribe list] Inserted ${items.length} tribes+memberships into Convex, ${skippedThisBatch} skipped (no leader: ${skipNoLeader}, bad createdAt: ${skipBadDate}, no member account: ${skipNoMember}).`,
    );
  }

  console.log("✅ Tribe list migration done");
}

// Calculator responses migration
async function migrateFootPrints() {
  const TABLE = MIGRATION_TABLE.WORDPRESS.WP_POSTS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listFootPrints(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;

    const postIds = batch
      .map((r) => Number(r.ID))
      .filter((id) => Number.isFinite(id) && id > 0);
    const scoresByPostId = await getFootprintScoresByPostIds(postIds);

    const records: any[] = [];

    for (const row of batch) {
      const postId = Number(row.ID);
      maxIdInBatch = postId;

      const email = extractEmailFromFootprintPost(row as FootprintAttemptRow);
      if (!email) continue;

      const userId = ctx.emailToUserId.get(email);
      if (!userId) continue;

      const accounts = ctx.userToAccounts.get(userId); // must have activeAccountId set in DB
      const accountId = accounts?.[0];

      const payload = parseFootprintPostToCalculatorPayload(
        row as PlasticFootprintPostRow,
        {
          attemptNumber: 1,
          scoreTotalFromMeta: scoresByPostId.get(postId),
        },
      );
      if (!payload) continue;

      const now = Date.now();
      const createdAt = payload.createdAt > 0 ? payload.createdAt : now;
      const updatedAt = payload.updatedAt > 0 ? payload.updatedAt : createdAt;

      records.push({
        userId,
        ...(accountId ? { accountId } : {}),
        ...payload,
        attemptNumber: 1,
        createdAt,
        updatedAt,
      });
    }

    if (records.length > 0) {
      await convex.mutation(api.migrations.bulkInsertCalculatorResponses, {
        records,
      });
    }

    const skippedThisBatch = batch.length - records.length;
    console.log(
      `[Footprints] Inserted ${records.length} into Convex, ${skippedThisBatch} skipped.`,
    );

    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }
  }

  console.log("✅ Footprints (calculator responses) migration done");
}

function resolveImpactRecordAccountId(input: {
  recipient: Record<string, unknown>;
  campaign: Record<string, unknown> | null;
}): string | null {
  const { recipient } = input;
  const wpUserId = Number(recipient.user_id);
  if (Number.isFinite(wpUserId) && wpUserId > 0) {
    const userId = ctx.wpIdToUserId.get(wpUserId);
    if (userId) {
      const accounts = ctx.userToAccounts.get(userId);
      if (accounts?.length) return accounts[0]!;
    }
  }
  const email = String(recipient.email ?? "")
    .trim()
    .toLowerCase();
  if (email) {
    const userId = ctx.emailToUserId.get(email);
    if (userId) {
      const accounts = ctx.userToAccounts.get(userId);
      if (accounts?.length) return accounts[0]!;
    }
  }
  return null;
}

async function migrateTrials() {
  const TABLE = MIGRATION_TABLE.LARAVEL.IMPACT_TRIAL_DATES;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;
  // Only works if user has activeAccountId set in DB

  for await (const batch of listImpactTrialDates(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;
    const records: {
      accountId: string;
      type: string;
      startDate: number;
      endDate: number;
      source: string;
      status: "active" | "expired";
      createdAt: number;
      updatedAt: number;
    }[] = [];

    for (const row of batch) {
      const now = Date.now();
      maxIdInBatch = Number(row.id);

      const wpUserId = Number(row.user_id);
      if (!Number.isFinite(wpUserId) || wpUserId <= 0) continue;
      const convexUserId = ctx.wpIdToUserId.get(wpUserId);
      if (!convexUserId) continue;
      const accounts = ctx.userToAccounts.get(convexUserId);
      const accountId = accounts?.[0] ?? null;
      if (!accountId) continue;

      const startRaw = row.start_trial;
      const endRaw = row.end_trial;
      if (startRaw == null || endRaw == null) continue;

      const startDate = parseDateToTimestamp(String(startRaw));
      const endDate = parseDateToTimestamp(String(endRaw));
      if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) continue;

      const createdAtRaw = row.created_at;
      const createdAt =
        createdAtRaw != null
          ? parseDateToTimestamp(String(createdAtRaw))
          : startDate;
      const createdAtFinal = Number.isFinite(createdAt) ? createdAt : startDate;

      records.push({
        accountId,
        type: "professional_impact_page",
        startDate,
        endDate,
        source: "signup",
        status: endDate > now ? "active" : "expired",
        createdAt: createdAtFinal,
        updatedAt: row.updated_at
          ? parseDateToTimestamp(String(row.updated_at))
          : now,
      });
    }

    if (records.length > 0) {
      await convex.mutation(api.migrations.bulkInsertTrials, { records });
    }

    const skippedThisBatch = batch.length - records.length;
    console.log(
      `[Trials] Inserted ${records.length} into Convex, ${skippedThisBatch} skipped.`,
    );

    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }
  }

  console.log("✅ Trials migration done");
}

async function migrateImpactRecords() {
  console.log("🔄 Migrating impact records...");
  const TABLE = MIGRATION_TABLE.LARAVEL.CAMPAIGN_RECIPIENTS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listCampaignRecipients(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;

    maxIdInBatch = batch[batch.length - 1].id as number;

    const enriched = await enrichCampaignRecipientBatch(batch);
    const records = mapEnrichedRecipientsToImpactRecords(enriched, {
      emailToUserId: ctx.emailToUserId,
      resolveAccountId: resolveImpactRecordAccountId,
    });

    if (records.length > 0) {
      await convex.mutation(api.migrations.bulkInsertImpactRecords, {
        records,
      });
    }

    const insertedIntoConvex = records.length;
    const campaignRecipientsInBatch = enriched.length;
    const skippedThisBatch = campaignRecipientsInBatch - insertedIntoConvex;
    console.log(
      `[Impact records] Inserted ${insertedIntoConvex} into Convex (${campaignRecipientsInBatch} Laravel rows in batch, ${skippedThisBatch} skipped).`,
    );

    // checkpoint AFTER mutation (same pattern as account migrations)
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }
  }

  console.log("✅ Impact records migration done");
}

async function migrateBusinessAccounts() {
  const TABLE = MIGRATION_TABLE.LARAVEL.IMPACT_PAGES;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listBusinessImpactPages(lastId, 50)) {
    let maxIdInBatch: number = lastId;
    const records: any[] = [];
    const ownerIdsQueuedThisBatch = new Set<string>();

    for (const p of batch) {
      maxIdInBatch = Number(p.id);

      const ownerId = ctx.wpIdToUserId.get(Number(p.user_id));
      if (!ownerId) continue; // If user from WP not migrated
      if (ctx.ownerAccountTypes.get(ownerId)?.has("business")) continue;
      if (ownerIdsQueuedThisBatch.has(ownerId)) continue;
      ownerIdsQueuedThisBatch.add(ownerId);

      records.push({
        ownerId,
        type: "business",
        name: p.company_name || "Business Account",
        slug:
          p.slug || generateSlug(String(p.company_name) || `business-${p.id}`),
        isDefault: true,
        onboardingCompleted: true,
        isActiveAdvisor:
          ctx.affiliateActiveByWpUserId.get(Number(p.user_id)) ?? false,
        createdAt: parseDateToTimestamp(String(p.created_at)),
        updatedAt: p.updated_at
          ? parseDateToTimestamp(String(p.updated_at))
          : Date.now(),
        profile: mapBusinessImpactPageToProfile(p as Record<string, unknown>),
      });
    }

    // single mutation per batch
    if (records.length > 0) {
      const ownerAndAccountIds: any = await convex.mutation(
        api.migrations.bulkInsertImpactAccounts,
        {
          records,
        },
      );

      await refillAcountIdForUsers(ownerAndAccountIds, records);
    }

    // checkpoint AFTER mutation
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }
  }
  console.log("✅ Business accounts migration done");
}

async function refillAcountIdForUsers(
  results: { ownerId: string; accountId: string }[],
  records: { ownerId: string; type: OwnerAccountKind }[],
) {
  if (results.length !== records.length) {
    throw new Error(
      `refillAcountIdForUsers: results.length (${results.length}) !== records.length (${records.length})`,
    );
  }
  for (let i = 0; i < results.length; i++) {
    if (!results[i].accountId) continue;
    registerOwnerAccountType(results[i].ownerId, records[i].type);
  }

  // map accountId to users
  for (const result of results) {
    const { ownerId, accountId } = result;
    // Skip if no account
    if (!accountId) continue;
    // Get or initialize account list for this user
    let userAccounts = ctx.userToAccounts.get(ownerId);
    if (!userAccounts) {
      userAccounts = [];
      ctx.userToAccounts.set(ownerId, userAccounts);
    }
    // Add account if not already present
    if (!userAccounts.includes(accountId)) {
      userAccounts.push(accountId);
    }
  }

  const patches = results
    .filter((r) => r.accountId)
    .map((r) => ({
      _id: r.ownerId as any,
      activeAccountId: r.accountId,
    }));

  if (patches.length > 0) {
    await convex.mutation(api.migrations.bulkPatchUserAccountId, {
      patches,
    });
  }
}

async function migratePersonalAccounts() {
  const TABLE = MIGRATION_TABLE.LARAVEL.PERSONAL_IMPACT_PAGES;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listPersonalImpactPages(lastId, 50)) {
    let maxIdInBatch: number = lastId;
    const records: any[] = [];
    const ownerIdsQueuedThisBatch = new Set<string>();

    for (const p of batch) {
      maxIdInBatch = Number(p.id);

      const ownerId = ctx.wpIdToUserId.get(Number(p.user_id));
      if (!ownerId) continue;
      if (ctx.ownerAccountTypes.get(ownerId)?.has("personal")) continue;
      if (ownerIdsQueuedThisBatch.has(ownerId)) continue;
      ownerIdsQueuedThisBatch.add(ownerId);

      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      records.push({
        ownerId,
        type: "personal",
        name: name || "Personal Account",
        slug: p.slug || generateSlug(name),
        isDefault: true,
        onboardingCompleted: true,
        isActiveAdvisor:
          ctx.affiliateActiveByWpUserId.get(Number(p.user_id)) ?? false,
        createdAt: parseDateToTimestamp(String(p.created_at)),
        updatedAt: p.updated_at
          ? parseDateToTimestamp(String(p.updated_at))
          : Date.now(),
        profile: mapPersonalImpactPageToProfile(p as Record<string, unknown>),
      });
    }

    if (records.length > 0) {
      const ownerAndAccountIds: any = await convex.mutation(
        api.migrations.bulkInsertImpactAccounts,
        {
          records,
        },
      );

      await refillAcountIdForUsers(ownerAndAccountIds, records);
    }

    // checkpoint AFTER mutation
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }
  }
  console.log("✅ Personal accounts migration done");
}

async function migrateFallbackAccounts() {
  console.log("🔄 Migrating fallback accounts...");
  const TABLE = MIGRATION_TABLE.LARAVEL.CAMPAIGN_RECIPIENTS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listCampaignRecipients(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;
    for (const r of batch) {
      maxIdInBatch = Number(r.id);
    }

    const enriched = await enrichCampaignRecipientBatch(batch);
    const records = buildFallbackImpactAccountRecordsForBatch(enriched, ctx);
    if (records.length > 0) {
      const ownerAndAccountIds: {
        ownerId: string;
        accountId: string;
      }[] = await convex.mutation(api.migrations.bulkInsertImpactAccounts, {
        records,
      });

      registerFallbackAccountsFromInsertResults(records, ownerAndAccountIds);
      await refillAcountIdForUsers(ownerAndAccountIds, records);
    }

    console.log(
      `[Fallback accounts] enriched=${enriched.length}, inserted=${records.length}`,
    );

    if (maxIdInBatch !== lastId) {
      // saveCheckpoint(TABLE, maxIdInBatch); // Skipping to re-fetch recipients from DB on impact records migration
      lastId = maxIdInBatch;
    }
  }

  console.log("✅ Fallback accounts migration done");
}

async function migrateDefaultPersonalAccountsForStragglers() {
  const stragglerIds = [...new Set(ctx.wpIdToUserId.values())].filter(
    (userId) => !ctx.userToAccounts.get(userId)?.length,
  );

  let inserted = 0;
  for (let i = 0; i < stragglerIds.length; i += BATCH_SIZE) {
    const chunk = stragglerIds.slice(i, i + BATCH_SIZE);
    const toInsert = chunk.filter(
      (ownerId) => !ctx.ownerAccountTypes.get(ownerId)?.has("personal"),
    );
    if (toInsert.length === 0) continue;

    const records = toInsert.map((ownerId) =>
      buildMinimalPersonalImpactAccount(
        ownerId,
        ctx.userIdToMeta.get(ownerId) ?? {},
        resolveIsActiveAdvisor(ctx, ownerId),
      ),
    );

    const ownerAndAccountIds: { ownerId: string; accountId: string }[] =
      await convex.mutation(api.migrations.bulkInsertImpactAccounts, {
        records,
      });
    await refillAcountIdForUsers(ownerAndAccountIds, records);
    inserted += records.length;
  }

  console.log(
    `[Straggler personal accounts] eligible=${stragglerIds.length}, inserted=${inserted}`,
  );
  console.log("✅ Default personal accounts for stragglers done");
}

async function migrateUsersFromWordpress() {
  const TABLE = MIGRATION_TABLE.WORDPRESS.USERS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listWpUsers(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;

    const cuidByEmail = await fetchCuidByEmails(
      batch.map((wp: any) => String(wp.user_email ?? "")),
    );

    const users = batch.map((wp: any) => {
      const { firstName, lastName } = splitFullName(
        wp.display_name || wp.user_login,
      );
      maxIdInBatch = Number(wp.ID);
      const normalizedEmail = normalizeAuthEmail(wp.user_email ?? "");
      return {
        ssoUserId:
          cuidByEmail.get(normalizedEmail) ?? '',
        email: wp.user_email,
        firstName: firstName,
        lastName: lastName,
        wordpressUserId: wp.ID,
        role: "user" as const,
        onboardingCompleted: true,
        signupSideEffectsCompleted: true,
        createdAt: new Date(wp.user_registered).getTime(),
        updatedAt: Date.now(),
      };
    });

    const result = await convex.mutation(api.migrations.bulkInsertUsers, {
      records: users,
    });

    if (!result || !Array.isArray(result)) {
      console.error("Failed to insert users batch", { result });
      continue;
    }

    result.forEach((r: any, i: number) => {
      const u = users[i];
      ctx.emailToUserId.set(u.email, r.id);
      ctx.wpIdToUserId.set(u.wordpressUserId, r.id);
      ctx.userIdToWpId.set(r.id, Number(u.wordpressUserId));
      ctx.userIdToMeta.set(r.id, {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
      });
    });

    // checkpoint AFTER mutation
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }

    console.log(`✅ Inserted ${users.length} users`);
  }
}
