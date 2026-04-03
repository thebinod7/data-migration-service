import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";

/** Matches main app `profileSections` table (see migration.md §5). */
const PROFILE_SECTIONS_TABLE = "profileSections" as const;
const HARDCODED_PROFILE_SECTION_CONFIG: Record<string, never> = {};

export const bulkPatchUserAccountId = mutation({
  args: {
    patches: v.array(
      v.object({
        _id: v.id("users"),
        activeAccountId: v.string(),
      }),
    ),
  },
  handler: async (ctx, { patches }) => {
    await Promise.all(
      patches.map(({ _id, activeAccountId }) =>
        ctx.db.patch(_id, { activeAccountId }),
      ),
    );
  },
});

const impactAccountProfileValidator = v.object({
  visibility: v.union(v.literal("private"), v.literal("public")),
  displayUnit: v.union(v.literal("Kg"), v.literal("Lbs"), v.literal("Bottles")),
  sectionOrder: v.array(v.string()),
  ctaUrl: v.optional(v.string()),
  inviteUrl: v.optional(v.string()),
  wordmarkId: v.optional(v.string()),
  logoId: v.optional(v.string()),
});

export const bulkInsertImpactAccounts = mutation({
  args: {
    records: v.array(
      v.object({
        ownerId: v.string(),
        type: v.string(),
        name: v.string(),
        slug: v.string(),
        isDefault: v.boolean(),
        onboardingCompleted: v.boolean(),
        isActiveAdvisor: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
        profile: v.optional(impactAccountProfileValidator),
      }),
    ),
  },

  handler: async (ctx, { records }) => {
    return await Promise.all(
      records.map(async (r) => {
        const { profile, ...accountFields } = r;
        const accountId = await ctx.db.insert("accounts", accountFields);
        await ctx.db.insert("accountMemberships", {
          accountId,
          userId: r.ownerId,
          role: "owner",
          createdAt: r.createdAt,
        });
        if (profile) {
          await ctx.db.insert("accountProfiles", {
            accountId,
            ...profile,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          });
        }
        await ctx.db.insert(PROFILE_SECTIONS_TABLE, {
          accountId,
          config: HARDCODED_PROFILE_SECTION_CONFIG,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
        return { ownerId: r.ownerId, accountId };
      }),
    );
  },
});

export const bulkInsertAccounts = mutation({
  args: {
    records: v.array(
      v.object({
        type: v.string(),
        name: v.string(),
        slug: v.string(),
        ownerId: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  },

  handler: async (ctx, args) => {
    for (const record of args.records) {
      await ctx.db.insert("accounts", record);
    }
  },
});

export const bulkInsertTribes = mutation({
  args: {
    records: v.array(
      v.object({
        leaderAccountId: v.string(),
        type: v.string(),
        createdAt: v.number(),
      }),
    ),
  },

  handler: async (ctx, args) => {
    for (const record of args.records) {
      await ctx.db.insert("tribes", record);
    }
  },
});

export const bulkInsertReferralCodes = mutation({
  args: {
    records: v.array(
      v.object({
        accountId: v.string(),
        code: v.string(),
        isActive: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  },

  handler: async (ctx, { records }) => {
    await Promise.all(
      records.map((record) => ctx.db.insert("referralCodes", record)),
    );
  },
});

export const bulkInsertUsers = mutation({
  args: {
    records: v.array(
      v.object({
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
      }),
    ),
  },

  handler: async (ctx, args) => {
    const inserted = await Promise.all(
      args.records.map(async (record) => {
        const id = await ctx.db.insert("users", record);
        return {
          id,
          email: record.email,
          wordpressUserId: record.wordpressUserId,
        };
      }),
    );

    return inserted;
  },
});

const impactRecordValidator = v.object({
  impactId: v.string(),
  accountId: v.string(),
  impactAmount: v.number(),
  impactRegion: v.string(),
  programId: v.string(),
  templateId: v.string(),
  source: v.string(),
  state: v.string(),
  attributionStatus: v.union(v.literal("assigned"), v.literal("unclaimed")),
  certificateNameOverride: v.string(),
  orderId: v.string(),
  originalEmail: v.string(),
  purchaserEmail: v.string(),
  createdAt: v.number(),
});

export const bulkInsertImpactRecords = mutation({
  args: {
    records: v.array(impactRecordValidator),
  },
  handler: async (ctx, { records }) => {
    await Promise.all(
      records.map((record) => ctx.db.insert("impactRecords", record)),
    );
  },
});

const trialRecordValidator = v.object({
  accountId: v.string(),
  type: v.string(),
  startDate: v.number(),
  endDate: v.number(),
  source: v.string(),
  status: v.union(v.literal("active"), v.literal("expired")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const bulkInsertTrials = mutation({
  args: {
    records: v.array(trialRecordValidator),
  },
  handler: async (ctx, { records }) => {
    await Promise.all(
      records.map((record) => ctx.db.insert("trials", record)),
    );
  },
});

/** Mirrors main app `convex/calculator/schema.ts` (`calculatorResponseFields` + nested validators). */
const calculatorScoreByPageValidator = v.object({
  q1: v.number(),
  q2: v.number(),
  q3: v.number(),
  q4: v.number(),
  q5: v.number(),
});

const calculatorCountrySnapshotValidator = v.object({
  code: v.string(),
  title: v.string(),
  averageKg: v.number(),
});

const calculatorDemographicsValidator = v.object({
  age: v.optional(v.string()),
  gender: v.optional(v.string()),
  occupation: v.optional(v.string()),
});

const calculatorResponseRecordValidator = v.object({
  userId: v.id("users"),
  accountId: v.optional(v.id("accounts")),
  attemptNumber: v.number(),
  country: v.optional(calculatorCountrySnapshotValidator),
  preferenceId: v.optional(v.string()),
  answers: v.record(v.string(), v.string()),
  scoreTotal: v.optional(v.number()),
  scoreBase: v.optional(v.number()),
  scoreByPage: v.optional(calculatorScoreByPageValidator),
  demographics: v.optional(calculatorDemographicsValidator),
  newsletterOptIn: v.optional(v.boolean()),
  sdgPersonal: v.optional(v.array(v.string())),
  sdgPlanet: v.optional(v.array(v.string())),
  referredBy: v.optional(v.string()),
  currentPage: v.string(),
  status: v.union(v.literal("in_progress"), v.literal("completed")),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const bulkInsertCalculatorResponses = mutation({
  args: {
    records: v.array(calculatorResponseRecordValidator),
  },
  handler: async (ctx, { records }) => {
    await Promise.all(
      records.map((record) => ctx.db.insert("calculatorResponses", record)),
    );
  },
});

async function deleteAllInTable(ctx: MutationCtx, table: string) {
  for (; ;) {
    const batch = await ctx.db.query(table).take(256);
    if (batch.length === 0) return;
    await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)));
  }
}

export const wipeAllData = mutation({
  handler: async (ctx) => {
    // Children / dependents first (migration also writes memberships, profiles, sections per account).
    await deleteAllInTable(ctx, "impactRecords");
    await deleteAllInTable(ctx, "trials");
    await deleteAllInTable(ctx, "calculatorResponses");
    await deleteAllInTable(ctx, PROFILE_SECTIONS_TABLE);
    await deleteAllInTable(ctx, "accountProfiles");
    await deleteAllInTable(ctx, "accountMemberships");
    await deleteAllInTable(ctx, "accounts");
    await deleteAllInTable(ctx, "users");
  },
});
