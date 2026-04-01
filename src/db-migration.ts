import "dotenv/config";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  closeCertificateMysqlPool,
  listPersonalImpactPages,
} from "./extractors/certificate_app";
import { closeWordpressMysqlPool, listWpUsers } from "./extractors/wp_app";
import {
  generateSlug,
  parseDateToTimestamp,
  splitFullName,
} from "./utils/utils";

const BATCH_SIZE = 2;
const LAST_SEEN_ID = 0;

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const ctx = {
  emailToUserId: new Map<string, string>(),
  wpIdToUserId: new Map<number, string>(),
  userToAccounts: new Map<string, string[]>(),
};

// TODO: Remove ID_CAP
async function runMigration(): Promise<void> {
  try {
    // ---------------- First batch ----------------
    await migrateUsersFromWordpress();
    await migrateImpactAccounts();
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

async function migrateImpactAccounts() {
  for await (const batch of listPersonalImpactPages(LAST_SEEN_ID, BATCH_SIZE)) {
    for (const impact of batch) {
      console.log("Impact page=>", impact);
      const ownerId = ctx.wpIdToUserId.get(Number(impact.user_id));
      console.log({ ownerId });
      if (!ownerId) continue; // safety check

      const account = {
        ownerId,
        type: "personal",
        name: impact.company,
        slug: generateSlug(String(impact.company)),
        isDefault: true,
        createdAt: parseDateToTimestamp(String(impact.created_at)),
        updatedAt: Date.now(),
      };

      console.log("Migrating account", account);

      // insert into Convex
    }
  }
}

async function migrateUsersFromWordpress() {
  for await (const batch of listWpUsers(LAST_SEEN_ID, BATCH_SIZE)) {
    const users = batch.map((wp: any) => {
      const { firstName, lastName } = splitFullName(
        wp.display_name || wp.user_login,
      );
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

    console.log(`✅ Inserted ${users.length} users`);
  }
}
