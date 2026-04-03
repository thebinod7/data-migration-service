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

export const mapTribeFieldsToConvex = (tribes: any[]) => {
  if (!tribes.length) return [];
  return tribes.map((tribe) => {
    return {
      leaderAccountId: "leader_account_101",
      type: tribe.type === "PERSONAL" ? "personal" : "business",
      createdAt: new Date(tribe.createdAt).getTime(),
    };
  });
};
