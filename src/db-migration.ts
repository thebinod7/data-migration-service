import "dotenv/config";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  closeCertificateMysqlPool,
  listPersonalImpactPages,
} from "./extractors/certificate_app";
import { closeWordpressMysqlPool, listWpUsers } from "./extractors/wp_app";
import { splitFullName } from "./utils/utils";

const BATCH_SIZE = 2;
const LAST_SEEN_ID = 0;

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const ctx = {
  emailToUserId: new Map<string, string>(),
  wpIdToUserId: new Map<number, string>(),
  userToAccounts: new Map<string, string[]>(),
};

async function runMigration(): Promise<void> {
  try {
    // ---------------- USERS ----------------
    // await migrateUsersFromWordpress();

    // ---------------- ACCOUNTS ----------------
    await migrateImpactAccounts();

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
  const personalImpacts = listPersonalImpactPages(LAST_SEEN_ID, BATCH_SIZE);
  const businessImpacts = listPersonalImpactPages(LAST_SEEN_ID, BATCH_SIZE);

  // Prepare data for peronal impacts
  for await (const batch of personalImpacts) {
    console.log("Batch of personal impacts", batch);
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

    console.log(`Migrating batch of ${users.length} users...`);
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
