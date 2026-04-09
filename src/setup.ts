import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

import { listCampaigns, listImageTemplates } from "./extractors/certificate_app";
import { MIGRATION_TABLE } from "./config/tables";
import { getLastPrimaryKey, saveCheckpoint } from "./utils/checkpoint";
import { BATCH_SIZE } from "./constants/contants";
import { CertificateTemplateSourceRow, mapCampaignsRowsToConvexPrograms, mapCertificateTemplateRowsToConvexTemplates } from "./transformers/certificate-data";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const LOCAL_MAP = {
    PROGRAMS_BY_SLUG: 'programs-by-slug.json',
    TEMPLATES_BY_SLUG: 'templates-by-slug.json',
}


async function runSetup(): Promise<void> {
    // await setupTemplates();
    await setupPrograms();
    console.log("✅ PRE-MIGRATION SETUP COMPLETED!!!");
}

async function setupTemplates() {
    console.log("Setting up templates...");
    const TABLE = MIGRATION_TABLE.LARAVEL.IMAGE_TEMPLATES;
    let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;
    for await (const batch of listImageTemplates(lastId, BATCH_SIZE)) {
        let maxIdInBatch: number = lastId;

        maxIdInBatch = Number(batch[batch.length - 1].id);
        const records = mapCertificateTemplateRowsToConvexTemplates(batch as CertificateTemplateSourceRow[]);
        if (records.length > 0) {
            await convex.mutation(api.migrations.bulkInsertImageTemplates, {
                records: records,
            });
        }

        if (maxIdInBatch !== lastId) {
            saveCheckpoint(TABLE, maxIdInBatch);
            lastId = maxIdInBatch;
        }
        console.log(`✅ Inserted ${records.length} templates`);
    }
}

function writeProgramIdsBySlug(programIdsBySlug: Record<string, string>): void {
    const outPath = path.resolve(process.cwd(), LOCAL_MAP.PROGRAMS_BY_SLUG);
    fs.writeFileSync(
        outPath,
        JSON.stringify(programIdsBySlug, null, 2),
        "utf-8",
    );
    console.log(`Wrote program slug → id map: ${outPath}`);
}

async function setupPrograms() {
    console.log("Setting up programs...");
    const TABLE = MIGRATION_TABLE.LARAVEL.CAMPAIGNS;
    const programIdsBySlug: Record<string, string> = {};
    let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;
    for await (const batch of listCampaigns(lastId, BATCH_SIZE)) {
        let maxIdInBatch: number = lastId;

        maxIdInBatch = Number(batch[batch.length - 1].id);
        const records = mapCampaignsRowsToConvexPrograms(batch as any[]);
        if (records.length > 0) {
            const inserted = await convex.mutation(
                api.migrations.bulkInsertPrograms,
                { records },
            );
            for (const { slug, programId } of inserted) {
                programIdsBySlug[slug] = programId;
            }
        }

        if (maxIdInBatch !== lastId) {
            saveCheckpoint(TABLE, maxIdInBatch);
            lastId = maxIdInBatch;
        }
        console.log(`✅ Inserted ${records.length} programs`);
    }

    writeProgramIdsBySlug(programIdsBySlug);
}

runSetup().catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
});