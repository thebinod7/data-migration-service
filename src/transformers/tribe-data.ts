import { logger } from "../utils/logger";

export type ReferralCodeInsert = {
  accountId: string;
  code: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

/**
 * Maps tribe invites to Convex referral_codes rows. Rows without a resolved account are skipped.
 */
export function mapInviteFieldsToConvex(
  invites: any[],
  resolveAccountId: (invite: any) => string | null,
): ReferralCodeInsert[] {
  if (!invites.length) return [];

  const out: ReferralCodeInsert[] = [];
  for (const invite of invites) {
    const accountId = resolveAccountId(invite);
    if (!accountId) {
      logger.error("Skipping invite without account id", { wpMemberId: invite.memberId });
      continue;
    }

    const code = String(invite.trackingId ?? "").trim();
    if (!code) continue;

    const createdAt = new Date(invite.createdAt).getTime();
    const updatedAt = invite.updatedAt
      ? new Date(invite.updatedAt).getTime()
      : createdAt;

    out.push({
      accountId,
      code,
      isActive: invite.deletedAt == null,
      createdAt,
      updatedAt,
    });
  }
  return out;
}

export type TribeInsert = {
  leaderAccountId: string;
  type: string;
  createdAt: number;
};

/** Membership row for `bulkInsertTribesWithMemberships` (Convex accepts branded ids as strings). */
export type TribeMembershipWithoutTribeIdInsert = {
  accountId: string;
  referredByAccountId: string;
  joinedAt: number;
};

export type TribeWithMembershipInsert = {
  tribe: TribeInsert;
  membershipWithoutTribeId: TribeMembershipWithoutTribeIdInsert;
};

function mapTribeRowToInsert(
  tribe: any,
  resolveLeaderAccountId: (tribe: any) => string | null,
): TribeInsert | null {
  const leaderAccountId = resolveLeaderAccountId(tribe);
  if (!leaderAccountId) return null;

  const type =
    tribe.type === "PROFESSIONAL" || tribe.type === "professional"
      ? "business"
      : "personal";

  const createdAt = new Date(tribe.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return null;

  return { leaderAccountId, type, createdAt };
}

/**
 * Maps tribe rows to Convex `tribes` documents.
 * `leaderAccountId` is the inviter's Convex account id; rows without a resolved leader are skipped.
 */
export function mapTribeFieldsToConvex(
  tribes: any[],
  resolveLeaderAccountId: (tribe: any) => string | null = () => null,
): TribeInsert[] {
  if (!tribes.length) return [];

  const out: TribeInsert[] = [];
  for (const tribe of tribes) {
    const row = mapTribeRowToInsert(tribe, resolveLeaderAccountId);
    if (!row) continue;
    out.push(row);
  }
  return out;
}

/**
 * Maps tribe rows to `{ tribe, membershipWithoutTribeId }` for `bulkInsertTribesWithMemberships`.
 * Skips rows without a resolved leader, without a resolved member account, or with a non-finite `createdAt`.
 */
export function mapTribeRowsToTribesWithMemberships(
  tribes: any[],
  resolveLeaderAccountId: (tribe: any) => string | null = () => null,
  resolveMemberAccountId: (tribe: any) => string | null = () => null,
): TribeWithMembershipInsert[] {
  if (!tribes.length) return [];

  const out: TribeWithMembershipInsert[] = [];
  for (const tribe of tribes) {
    const tribeInsert = mapTribeRowToInsert(tribe, resolveLeaderAccountId);
    if (!tribeInsert) continue;

    const accountId = resolveMemberAccountId(tribe);
    if (!accountId) continue;

    out.push({
      tribe: tribeInsert,
      membershipWithoutTribeId: {
        accountId,
        referredByAccountId: tribeInsert.leaderAccountId,
        joinedAt: tribeInsert.createdAt,
      },
    });
  }
  return out;
}
