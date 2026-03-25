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
        email: v.string(),
        firstName: v.string(),
        lastName: v.string(),
        role: v.union(
          v.literal("user"),
          v.literal("admin"),
          v.literal("superadmin"),
        ),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  },

  handler: async (ctx, args) => {
    for (const record of args.records) {
      await ctx.db.insert("users", {
        ...record,

        personalAccountCreated: false,
        signupSideEffectsCompleted: false,
        onboardingCompleted: false,
      });
    }

    return { inserted: args.records.length };
  },
});
