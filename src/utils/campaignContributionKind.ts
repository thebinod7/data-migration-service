import { readCampaignTypesIdToSlug } from "./utils";

export type ContributionKind = "business" | "personal" | "community" | "pledge" | "promotional" | "other";

export function contributionKindFromCampaignTypeId(
  campaignTypeId: unknown,
): ContributionKind {
  const id = Number(campaignTypeId);
  if (!Number.isFinite(id)) return "other";
  const campaignTypesIdToSlug = readCampaignTypesIdToSlug();
  const type = campaignTypesIdToSlug[String(id)];
  if (type === "business") return "business";
  if (type === "personal") return "personal";
  // if (type) return type as ContributionKind;
  return "other";
}
