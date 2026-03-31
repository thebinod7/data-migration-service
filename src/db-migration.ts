import "dotenv/config";

import { closeWordpressMysqlPool, listWpUsers } from "./extractors/wp_app";

async function runMigration(): Promise<void> {
  // Fetch users
  try {
    const users = await listWpUsers(0, 10);
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
