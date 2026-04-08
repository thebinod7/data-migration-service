import "dotenv/config";
import { listImageTemplates } from "./extractors/certificate_app";

async function runSetup(): Promise<void> {
    console.log("Setting up...");
    await setupTemplates();
}

async function setupTemplates() {
    for await (const batch of listImageTemplates(0, 5)) {
        console.log(batch);
    }
}


async function setupProducts() { }

runSetup().catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
});