import "dotenv/config";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { MIGRATION_TABLE } from "./config/tables";
import {
  closeCertificateMysqlPool,
  listBusinessImpactPages,
  listCampaignRecipients,
  listPersonalImpactPages,
} from "./extractors/certificate_app";
import { closeWordpressMysqlPool, listWpUsers } from "./extractors/wp_app";
import { getLastPrimaryKey, saveCheckpoint } from "./utils/checkpoint";
import {
  generateSlug,
  parseDateToTimestamp,
  splitFullName,
} from "./utils/utils";

const BATCH_SIZE = 50;

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const ctx = {
  emailToUserId: new Map<string, string>(),
  wpIdToUserId: new Map<number, string>(),
  userToAccounts: new Map<string, string[]>(),
};

async function runMigration(): Promise<void> {
  try {
    // ---------------- First batch ----------------
    await migrateUsersFromWordpress();
    await migratePersonalAccounts();
    await migrateBusinessAccounts();
    // await migrateFallbackAccounts();
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

async function migrateFallbackAccounts() {
  const TABLE = MIGRATION_TABLE.LARAVEL.CAMPAIGN_RECIPIENTS;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;
  const userCampaignTypes = new Map<number, Set<"business" | "personal">>();

  for await (const batch of listCampaignRecipients(lastId, BATCH_SIZE)) {
    for (const c of batch) {
      console.log("Campaign:", c);
      const userId = Number(c.user_id);
      const type: "business" | "personal" =
        c.campaign_type === "business"
          ? "business"
          : c.campaign_type === "personal"
            ? "personal"
            : "personal"; // default fallback

      if (!userCampaignTypes.has(userId)) {
        userCampaignTypes.set(userId, new Set());
      }
      userCampaignTypes.get(userId)!.add(type);
    }
  }
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
