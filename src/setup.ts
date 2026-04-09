import "dotenv/config";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

import { listCampaigns, listImageTemplates } from "./extractors/certificate_app";
import { MIGRATION_TABLE } from "./config/tables";
import { getLastPrimaryKey, saveCheckpoint } from "./utils/checkpoint";
import { BATCH_SIZE } from "./constants/contants";
import { CertificateTemplateSourceRow, mapCampaignsRowsToConvexPrograms, mapCertificateTemplateRowsToConvexTemplates } from "./transformers/certificate-data";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);


async function runSetup(): Promise<void> {
    await setupTemplates();
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


async function setupPrograms() {
    console.log("Setting up programs...");
    const TABLE = MIGRATION_TABLE.LARAVEL.CAMPAIGNS;
    let lastId = (getLastPrimaryKey(TABLE) as number) ?? 0;
    for await (const batch of listCampaigns(lastId, BATCH_SIZE)) {
        let maxIdInBatch: number = lastId;

        maxIdInBatch = Number(batch[batch.length - 1].id);
        const records = mapCampaignsRowsToConvexPrograms(batch as any[]);
        if (records.length > 0) {
            await convex.mutation(api.migrations.bulkInsertPrograms, {
                records: records,
            });
        }

        if (maxIdInBatch !== lastId) {
            saveCheckpoint(TABLE, maxIdInBatch);
            lastId = maxIdInBatch;
        }
        console.log(`✅ Inserted ${records.length} programs`);
    }
}

runSetup().catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
});