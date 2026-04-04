import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { mapWordpressUsersToConvex } from "../transformers/wp-data";
import {
  mapInviteFieldsToConvex,
  mapTribeFieldsToConvex,
} from "../transformers/tribe-data";
import { mapUsersFieldsToConvexAccount } from "../transformers/certificate-data";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export async function writeCertificateAppDataBached(
  sourceTable: string,
  documents: Record<string, unknown>[],
) {
  if (sourceTable === "users") {
    const mappedAccounts = mapUsersFieldsToConvexAccount(documents);
    return convex.mutation(api.migrations.bulkInsertAccounts, {
      records: mappedAccounts,
    });
  }
  if (sourceTable === "personal_impact_pages") {
    console.log("Writing impact pages to convex==>", documents.length);
  }
}

export async function writeTribeAppDataBached(
  sourceTable: string,
  documents: Record<string, unknown>[],
) {
  if (sourceTable === "tbl_invites") {
    console.log("Writing invites to convex==>", documents.length);
    const parsedInvites = mapInviteFieldsToConvex(documents, () => null);
    if (parsedInvites.length === 0) return;
    return convex.mutation(api.migrations.bulkInsertReferralCodes, {
      records: parsedInvites,
    });
  }
  if (sourceTable === "tbl_tribes") {
    console.log("Writing tribes to convex==>", documents.length);
    const mappedData = mapTribeFieldsToConvex(documents);
    return convex.mutation(api.migrations.bulkInsertTribes, {
      records: mappedData,
    });
  }
}

export async function writeWordpressAppDataBached(
  sourceTable: string,
  documents: Record<string, unknown>[],
) {
  if (sourceTable === "76a_users") {
    // TODO: Make unique field and ssoId??
    console.log("writing users===>", documents.length);
    const parsedUsers = mapWordpressUsersToConvex(documents);
    return convex.mutation(api.migrations.bulkInsertUsers, {
      records: parsedUsers,
    });
  }
  if (sourceTable === "wp_posts") {
    console.log("Write to account table:", documents.length);
  }
}
