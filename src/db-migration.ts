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
  closeWordpressMysqlPool,
  getFootprintScoresByPostIds,
  listFootPrints,
  listWpUsers,
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
  splitFullName,
} from "./utils/utils";
import { fetchInvitesInBatches } from "./extractors/tribe_app";

const BATCH_SIZE = 50;
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const ctx = {
  emailToUserId: new Map<string, string>(),
  wpIdToUserId: new Map<number, string>(),
  userToAccounts: new Map<string, string[]>(),
};

async function runMigration(): Promise<void> {
  try {
    // await convex.mutation(api.migrations.wipeAllData);
    console.log("=====Convex data wiped=====");
    // ---------------- First batch ----------------
    // await migrateUsersFromWordpress();
    // await migratePersonalAccounts();
    // await migrateBusinessAccounts();
    // await migrateTrials();
    // await migrateImpactRecords();
    // await migrateFootPrints();
    await migrateTribeInvites();
    // ---------------- End of first batch ----------------

    console.log("✅ Migration completed!");
  } catch (err: any) {
    console.error("Migration failed!", {
      error: err?.message,
      stack: err?.stack,
    });
    process.exit(1);
  } finally {
    await closeWordpressMysqlPool();
    await closeCertificateMysqlPool();
  }
}

runMigration();

async function migrateTribeInvites() {
  const TABLE = MIGRATION_TABLE.TRIBE.INVITES;

  for await (const batch of fetchInvitesInBatches({ limit: BATCH_SIZE, cursorCreatedAt: null })) {
    console.log("BATCH==>", batch.length);
  }

  console.log("✅ Tribe invites migration done");
}

async function migrateFootPrints() {
  const TABLE = MIGRATION_TABLE.WORDPRESS.WP_POSTS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listFootPrints(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;

    console.log("BATCH==>", batch);

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

    console.log("RECORDS==>", records);

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
        type: 'professional_impact_page',
        startDate,
        endDate,
        source: "signup",
        status: endDate > now ? "active" : "expired",
        createdAt: createdAtFinal,
        updatedAt: row.updated_at ? parseDateToTimestamp(String(row.updated_at)) : now,
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
  const TABLE = MIGRATION_TABLE.LARAVEL.CAMPAIGN_RECIPIENTS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listCampaignRecipients(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;

    for (const r of batch) {
      maxIdInBatch = Number(r.id);
    }

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

    for (const p of batch) {
      maxIdInBatch = Number(p.id);

      const ownerId = ctx.wpIdToUserId.get(Number(p.user_id));
      if (!ownerId) continue;

      records.push({
        ownerId,
        type: "business",
        name: p.company_name || "Business Account",
        slug:
          p.slug || generateSlug(String(p.company_name) || `business-${p.id}`),
        isDefault: true,
        onboardingCompleted: true,
        isActiveAdvisor: false,
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

      await refillAcountIdForUsers(ownerAndAccountIds);
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
) {
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

    for (const p of batch) {
      maxIdInBatch = Number(p.id);

      const ownerId = ctx.wpIdToUserId.get(Number(p.user_id));
      if (!ownerId) continue;

      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      records.push({
        ownerId,
        type: "personal",
        name: name || "Personal Account",
        slug: p.slug || generateSlug(name),
        isDefault: true,
        onboardingCompleted: true,
        isActiveAdvisor: false,
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

      await refillAcountIdForUsers(ownerAndAccountIds);
    }

    // checkpoint AFTER mutation
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }
  }
  console.log("✅ Personal accounts migration done");
}


async function migrateUsersFromWordpress() {
  const TABLE = MIGRATION_TABLE.WORDPRESS.USERS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;

  for await (const batch of listWpUsers(lastId, BATCH_SIZE)) {
    let maxIdInBatch: number = lastId;

    const users = batch.map((wp: any) => {
      const { firstName, lastName } = splitFullName(
        wp.display_name || wp.user_login,
      );
      maxIdInBatch = Number(wp.ID);
      return {
        ssoUserId: `wp-${wp.ID}`, // TODO: get ssoId from Auth Server
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
    });

    // checkpoint AFTER mutation
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
    }

    console.log(`✅ Inserted ${users.length} users`);
  }
}
