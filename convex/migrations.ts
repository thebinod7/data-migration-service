// convex/migrations.ts
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

export const bulkInsertUsers = mutation({
  args: {
    records: v.array(
      v.object({
        id: v.string(), // original postgres ID
        name: v.string(),
        email: v.string(),
        createdAt: v.number(), // epoch ms
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const record of args.records) {
      await ctx.db.insert("users", record);
    }
    return { inserted: args.records.length };
  },
});
