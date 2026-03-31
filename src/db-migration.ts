import "dotenv/config";

import { closeWordpressMysqlPool, listWpUsers } from "./extractors/wp_app";

const BATCH_SIZE = 5;
const LAST_SEEN_ID = 0;

async function runMigration(): Promise<void> {
  // Fetch users
  try {
    const users = await listWpUsers(LAST_SEEN_ID, BATCH_SIZE);
    console.log("USERS:==>", users);
  } catch (err: any) {
    console.error("Migration failed!", {
      error: err?.message,
      stack: err?.stack,
    });
    process.exit(1);
  } finally {
    await closeWordpressMysqlPool();
  }
}

runMigration();
