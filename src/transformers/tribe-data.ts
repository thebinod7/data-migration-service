export const mapInviteToReferralCode = (invites: any[]) => {
  if (!invites.length) return [];

  return invites.map((invite) => {
    return {
      accountId: "account_101", //TODO: Get accountId by memberId
      code: invite.trackingId,
      isActive: invite.deletedAt === null,
      createdAt: new Date(invite.createdAt).getTime(),
      updatedAt: invite.updatedAt
        ? new Date(invite.updatedAt).getTime()
        : new Date(invite.createdAt).getTime(),
    };
  });
};

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
