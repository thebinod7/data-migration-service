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
