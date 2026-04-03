"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wipeAllData = exports.bulkInsertCalculatorResponses = exports.bulkInsertTrials = exports.bulkInsertImpactRecords = exports.bulkInsertUsers = exports.bulkInsertReferralCodes = exports.bulkInsertTribes = exports.bulkInsertAccounts = exports.bulkInsertImpactAccounts = exports.bulkPatchUserAccountId = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
/** Matches main app `profileSections` table (see migration.md §5). */
const PROFILE_SECTIONS_TABLE = "profileSections";
const HARDCODED_PROFILE_SECTION_CONFIG = {};
exports.bulkPatchUserAccountId = (0, server_1.mutation)({
    args: {
        patches: values_1.v.array(values_1.v.object({
            _id: values_1.v.id("users"),
            activeAccountId: values_1.v.string(),
        })),
    },
    handler: async (ctx, { patches }) => {
        await Promise.all(patches.map(({ _id, activeAccountId }) => ctx.db.patch(_id, { activeAccountId })));
    },
});
const impactAccountProfileValidator = values_1.v.object({
    visibility: values_1.v.union(values_1.v.literal("private"), values_1.v.literal("public")),
    displayUnit: values_1.v.union(values_1.v.literal("Kg"), values_1.v.literal("Lbs"), values_1.v.literal("Bottles")),
    sectionOrder: values_1.v.array(values_1.v.string()),
    ctaUrl: values_1.v.optional(values_1.v.string()),
    inviteUrl: values_1.v.optional(values_1.v.string()),
    wordmarkId: values_1.v.optional(values_1.v.string()),
    logoId: values_1.v.optional(values_1.v.string()),
});
exports.bulkInsertImpactAccounts = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(values_1.v.object({
            ownerId: values_1.v.string(),
            type: values_1.v.string(),
            name: values_1.v.string(),
            slug: values_1.v.string(),
            isDefault: values_1.v.boolean(),
            onboardingCompleted: values_1.v.boolean(),
            isActiveAdvisor: values_1.v.boolean(),
            createdAt: values_1.v.number(),
            updatedAt: values_1.v.number(),
            profile: values_1.v.optional(impactAccountProfileValidator),
        })),
    },
    handler: async (ctx, { records }) => {
        return await Promise.all(records.map(async (r) => {
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
        }));
    },
});
exports.bulkInsertAccounts = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(values_1.v.object({
            type: values_1.v.string(),
            name: values_1.v.string(),
            slug: values_1.v.string(),
            ownerId: values_1.v.string(),
            createdAt: values_1.v.number(),
            updatedAt: values_1.v.number(),
        })),
    },
    handler: async (ctx, args) => {
        for (const record of args.records) {
            await ctx.db.insert("accounts", record);
        }
    },
});
exports.bulkInsertTribes = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(values_1.v.object({
            leaderAccountId: values_1.v.string(),
            type: values_1.v.string(),
            createdAt: values_1.v.number(),
        })),
    },
    handler: async (ctx, args) => {
        for (const record of args.records) {
            await ctx.db.insert("tribes", record);
        }
    },
});
exports.bulkInsertReferralCodes = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(values_1.v.object({
            accountId: values_1.v.string(),
            code: values_1.v.string(),
            isActive: values_1.v.boolean(),
            createdAt: values_1.v.number(),
            updatedAt: values_1.v.number(),
        })),
    },
    handler: async (ctx, args) => {
        for (const record of args.records) {
            await ctx.db.insert("referral_codes", record);
        }
    },
});
exports.bulkInsertUsers = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(values_1.v.object({
            ssoUserId: values_1.v.string(),
            wordpressUserId: values_1.v.number(),
            email: values_1.v.string(),
            firstName: values_1.v.string(),
            lastName: values_1.v.string(),
            role: values_1.v.union(values_1.v.literal("user"), values_1.v.literal("admin"), values_1.v.literal("superadmin")),
            onboardingCompleted: values_1.v.boolean(),
            signupSideEffectsCompleted: values_1.v.boolean(),
            createdAt: values_1.v.number(),
            updatedAt: values_1.v.number(),
        })),
    },
    handler: async (ctx, args) => {
        const inserted = await Promise.all(args.records.map(async (record) => {
            const id = await ctx.db.insert("users", record);
            return {
                id,
                email: record.email,
                wordpressUserId: record.wordpressUserId,
            };
        }));
        return inserted;
    },
});
const impactRecordValidator = values_1.v.object({
    impactId: values_1.v.string(),
    accountId: values_1.v.string(),
    impactAmount: values_1.v.number(),
    impactRegion: values_1.v.string(),
    programId: values_1.v.string(),
    templateId: values_1.v.string(),
    source: values_1.v.string(),
    state: values_1.v.string(),
    attributionStatus: values_1.v.union(values_1.v.literal("assigned"), values_1.v.literal("unclaimed")),
    certificateNameOverride: values_1.v.string(),
    orderId: values_1.v.string(),
    originalEmail: values_1.v.string(),
    purchaserEmail: values_1.v.string(),
    createdAt: values_1.v.number(),
});
exports.bulkInsertImpactRecords = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(impactRecordValidator),
    },
    handler: async (ctx, { records }) => {
        await Promise.all(records.map((record) => ctx.db.insert("impactRecords", record)));
    },
});
const trialRecordValidator = values_1.v.object({
    accountId: values_1.v.string(),
    type: values_1.v.string(),
    startDate: values_1.v.number(),
    endDate: values_1.v.number(),
    source: values_1.v.string(),
    status: values_1.v.union(values_1.v.literal("active"), values_1.v.literal("expired")),
    createdAt: values_1.v.number(),
    updatedAt: values_1.v.number(),
});
exports.bulkInsertTrials = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(trialRecordValidator),
    },
    handler: async (ctx, { records }) => {
        await Promise.all(records.map((record) => ctx.db.insert("trials", record)));
    },
});
/** Mirrors main app `convex/calculator/schema.ts` (`calculatorResponseFields` + nested validators). */
const calculatorScoreByPageValidator = values_1.v.object({
    q1: values_1.v.number(),
    q2: values_1.v.number(),
    q3: values_1.v.number(),
    q4: values_1.v.number(),
    q5: values_1.v.number(),
});
const calculatorCountrySnapshotValidator = values_1.v.object({
    code: values_1.v.string(),
    title: values_1.v.string(),
    averageKg: values_1.v.number(),
});
const calculatorDemographicsValidator = values_1.v.object({
    age: values_1.v.optional(values_1.v.string()),
    gender: values_1.v.optional(values_1.v.string()),
    occupation: values_1.v.optional(values_1.v.string()),
});
const calculatorResponseRecordValidator = values_1.v.object({
    userId: values_1.v.id("users"),
    accountId: values_1.v.optional(values_1.v.id("accounts")),
    attemptNumber: values_1.v.number(),
    country: values_1.v.optional(calculatorCountrySnapshotValidator),
    preferenceId: values_1.v.optional(values_1.v.string()),
    answers: values_1.v.record(values_1.v.string(), values_1.v.string()),
    scoreTotal: values_1.v.optional(values_1.v.number()),
    scoreBase: values_1.v.optional(values_1.v.number()),
    scoreByPage: values_1.v.optional(calculatorScoreByPageValidator),
    demographics: values_1.v.optional(calculatorDemographicsValidator),
    newsletterOptIn: values_1.v.optional(values_1.v.boolean()),
    sdgPersonal: values_1.v.optional(values_1.v.array(values_1.v.string())),
    sdgPlanet: values_1.v.optional(values_1.v.array(values_1.v.string())),
    referredBy: values_1.v.optional(values_1.v.string()),
    currentPage: values_1.v.string(),
    status: values_1.v.union(values_1.v.literal("in_progress"), values_1.v.literal("completed")),
    completedAt: values_1.v.optional(values_1.v.number()),
    createdAt: values_1.v.number(),
    updatedAt: values_1.v.number(),
});
exports.bulkInsertCalculatorResponses = (0, server_1.mutation)({
    args: {
        records: values_1.v.array(calculatorResponseRecordValidator),
    },
    handler: async (ctx, { records }) => {
        await Promise.all(records.map((record) => ctx.db.insert("calculatorResponses", record)));
    },
});
async function deleteAllInTable(ctx, table) {
    for (;;) {
        const batch = await ctx.db.query(table).take(256);
        if (batch.length === 0)
            return;
        await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)));
    }
}
exports.wipeAllData = (0, server_1.mutation)({
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
