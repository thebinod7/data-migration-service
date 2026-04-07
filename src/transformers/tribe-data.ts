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
    if (!accountId) continue;

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
    const leaderAccountId = resolveLeaderAccountId(tribe);
    if (!leaderAccountId) continue;

    const type =
      tribe.type === "PROFESSIONAL" || tribe.type === "professional"
        ? "business"
        : "personal";

    const createdAt = new Date(tribe.createdAt).getTime();
    if (!Number.isFinite(createdAt)) continue;

    out.push({ leaderAccountId, type, createdAt });
  }
  return out;
}
