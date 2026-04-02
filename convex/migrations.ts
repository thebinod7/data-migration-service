import { v } from "convex/values";
import { mutation } from "./_generated/server";

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

  handler: async (ctx, args) => {
    for (const record of args.records) {
      await ctx.db.insert("referral_codes", record);
    }
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

// ============QUERIES FOR CHECKPOINTING ============
