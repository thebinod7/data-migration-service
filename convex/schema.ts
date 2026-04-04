import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Keeps migration Convex deployment aligned with tables written in `migrations.ts`. */
export default defineSchema({
  users: defineTable({
    ssoUserId: v.string(),
    wordpressUserId: v.number(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("admin"),
      v.literal("superadmin"),
    ),
    onboardingCompleted: v.boolean(),
    signupSideEffectsCompleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    activeAccountId: v.optional(v.string()),
  }),

  accounts: defineTable({
    ownerId: v.string(),
    type: v.string(),
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    isDefault: v.optional(v.boolean()),
    onboardingCompleted: v.optional(v.boolean()),
    isActiveAdvisor: v.optional(v.boolean()),
  }).index("by_ownerId_type", ["ownerId", "type"]),

  accountMemberships: defineTable({
    accountId: v.id("accounts"),
    userId: v.string(),
    role: v.string(),
    createdAt: v.number(),
  }),

  accountProfiles: defineTable({
    accountId: v.id("accounts"),
    visibility: v.union(v.literal("private"), v.literal("public")),
    displayUnit: v.union(
      v.literal("Kg"),
      v.literal("Lbs"),
      v.literal("Bottles"),
    ),
    sectionOrder: v.array(v.string()),
    ctaUrl: v.optional(v.string()),
    inviteUrl: v.optional(v.string()),
    wordmarkId: v.optional(v.string()),
    logoId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  profileSections: defineTable({
    accountId: v.id("accounts"),
    /** Migration writes `{}`; main app may use richer shapes. */
    config: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  tribes: defineTable({
    leaderAccountId: v.string(),
    type: v.string(),
    createdAt: v.number(),
  }),

  referralCodes: defineTable({
    accountId: v.string(),
    code: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  impactRecords: defineTable({
    impactId: v.string(),
    accountId: v.string(),
    impactAmount: v.number(),
    impactRegion: v.string(),
    programId: v.string(),
    templateId: v.string(),
    source: v.string(),
    state: v.string(),
    attributionStatus: v.union(
      v.literal("assigned"),
      v.literal("unclaimed"),
    ),
    certificateNameOverride: v.string(),
    orderId: v.string(),
    originalEmail: v.string(),
    purchaserEmail: v.string(),
    createdAt: v.number(),
    contributionKind: v.union(
      v.literal("business"),
      v.literal("personal"),
      v.literal("other"),
    ),
  }),

  trials: defineTable({
    accountId: v.string(),
    type: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    source: v.string(),
    status: v.union(v.literal("active"), v.literal("expired")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  calculatorResponses: defineTable({
    userId: v.id("users"),
    accountId: v.optional(v.id("accounts")),
    attemptNumber: v.number(),
    country: v.optional(
      v.object({
        code: v.string(),
        title: v.string(),
        averageKg: v.number(),
      }),
    ),
    preferenceId: v.optional(v.string()),
    answers: v.record(v.string(), v.string()),
    scoreTotal: v.optional(v.number()),
    scoreBase: v.optional(v.number()),
    scoreByPage: v.optional(
      v.object({
        q1: v.number(),
        q2: v.number(),
        q3: v.number(),
        q4: v.number(),
        q5: v.number(),
      }),
    ),
    demographics: v.optional(
      v.object({
        age: v.optional(v.string()),
        gender: v.optional(v.string()),
        occupation: v.optional(v.string()),
      }),
    ),
    newsletterOptIn: v.optional(v.boolean()),
    sdgPersonal: v.optional(v.array(v.string())),
    sdgPlanet: v.optional(v.array(v.string())),
    referredBy: v.optional(v.string()),
    currentPage: v.string(),
    status: v.union(v.literal("in_progress"), v.literal("completed")),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
});
