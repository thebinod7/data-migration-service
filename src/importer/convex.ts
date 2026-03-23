import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { parseWpUsersToConvex } from "../transformers/wp-data";
import { mapInviteToReferralCode } from "../transformers/tribe-data";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export async function writeCertificateAppDataBached(
  sourceTable: string,
  documents: Record<string, unknown>[],
) {
  console.log("writing to convexbatch===>", documents.length);
  return new Promise((resolve) => setTimeout(resolve, 100));
}

export async function writeTribeAppDataBached(
  sourceTable: string,
  documents: Record<string, unknown>[],
) {
  if (sourceTable === "tbl_invites") {
    console.log("Writing invites to referral codes=>", documents.length);
    const parsedInvites = mapInviteToReferralCode(documents);
    return convex.mutation(api.migrations.bulkInsertReferralCodes, {
      records: parsedInvites,
    });
  }
  if (sourceTable === "tbl_tribes") {
    console.log("Writing tribes=>", documents.length);
  }
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
