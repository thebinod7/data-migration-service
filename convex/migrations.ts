import { mutation } from "./_generated/server";
import { v } from "convex/values";

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
          personalAccountCreated: false,
          signupSideEffectsCompleted: true,
          onboardingCompleted: true,
        };
      }),
    );

    return inserted;
  },
});
