import "dotenv/config";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { MIGRATION_TABLE } from "./config/tables";
import {
  closeCertificateMysqlPool,
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

async function migrateBusinessAccounts() {}
async function migratePersonalAccounts() {
  const TABLE = MIGRATION_TABLE.LARAVEL.PERSONAL_IMPACT_PAGES;
  let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;
  console.log(`🚀 Starting from pimpact.id > ${lastId}`);

  for await (const batch of listPersonalImpactPages(lastId, 50)) {
    let maxIdInBatch: number = lastId;

    const records: any[] = [];

    for (const p of batch) {
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
        updatedAt: Date.now(),
      });

      maxIdInBatch = Number(p.id);
    }

    console.log("RECORDS[0]", records[0]);

    // ✅ single mutation per batch
    if (records.length > 0) {
      await convex.mutation(api.migrations.bulkInsertPersonalAccounts, {
        records,
      });
    }

    // ✅ checkpoint AFTER mutation
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
      console.log(`📦 personal_accounts → ${lastId}`);
    }
  }
  console.log("✅ Personal accounts migration done");
}

async function migrateFallbackAccounts() {}

// async function migrateImpactAccounts() {
//   console.log("WpIdToUserId map=>", ctx.wpIdToUserId);
//   for await (const batch of listPersonalImpactPages(LAST_SEEN_ID, BATCH_SIZE)) {
//     for (const impact of batch) {
//       console.log("Impact page=>", impact);
//       const ownerId = ctx.wpIdToUserId.get(Number(impact.user_id));
//       console.log({ ownerId });
//       if (!ownerId) continue; // safety check

//       const account = {
//         ownerId,
//         type: "personal",
//         name: impact.company,
//         slug: generateSlug(String(impact.company)),
//         isDefault: true,
//         createdAt: parseDateToTimestamp(String(impact.created_at)),
//         updatedAt: Date.now(),
//       };

//       console.log("Migrating account", account);

//       // insert into Convex
//     }
//   }
// }

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

    // ✅ checkpoint AFTER mutation
    if (maxIdInBatch !== lastId) {
      saveCheckpoint(TABLE, maxIdInBatch);
      lastId = maxIdInBatch;
      console.log(`📦 personal_accounts → ${lastId}`);
    }

    console.log(`✅ Inserted ${users.length} users`);
  }
}
