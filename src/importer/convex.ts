import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { parseWpUsersToConvex } from "../transformers/wp-data";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export async function writeCertificateAppDataBached(
  convexTable: string,
  documents: Record<string, unknown>[],
) {
  console.log("writing to convexbatch===>", documents.length);
  return new Promise((resolve) => setTimeout(resolve, 100));
}

export async function writeWordpressAppDataBached(
  sourceTable: string,
  documents: Record<string, unknown>[],
) {
  if (sourceTable === "76a_users") {
    // TODO: Make unique field and ssoId??
    console.log("writing users===>", documents.length);
    const parsedUsers = parseWpUsersToConvex(documents);
    return convex.mutation(api.migrations.bulkInsertUsers, {
      records: parsedUsers,
    });
  }
  if (sourceTable === "76a_accounts") {
    console.log("Write to account table");
  }
}
