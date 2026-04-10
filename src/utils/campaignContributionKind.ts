/**
 * Laravel `campaign_types.id` → personal vs business contribution.
 * DB rows: 1 Business, 2 Community, 3 Personal, 4 Pledge, 5 Promotional.
 */
export type ContributionKind = "business" | "personal" | "other";

// TODO: Make this dynamic
export function contributionKindFromCampaignTypeId(
  campaignTypeId: unknown,
): ContributionKind {
  const id = Number(campaignTypeId);
  if (!Number.isFinite(id)) return "other";
  if (id === 1) return "business";
  if (id === 3) return "personal";
  return "other";
}
