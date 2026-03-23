import { mutation } from "./_generated/server";
import { v } from "convex/values";

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
