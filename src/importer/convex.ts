import { config } from "../config";
import { logger } from "../utils/logger";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const MUTATION_PATH = "migrations:insertBatch";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call Convex mutation via HTTP API.
 * Requires the Convex app to define a mutation at "migrations:insertBatch" with args:
 *   { table: string, documents: Record<string, unknown>[] }
 * that inserts each document into the given table.
 */
async function callInsertBatch(
  table: string,
  documents: Record<string, unknown>[],
): Promise<void> {
  const url = `${config.convex.deploymentUrl.replace(/\/$/, "")}/api/mutation`;
  const body = {
    path: MUTATION_PATH,
    args: { table, documents },
    format: "json" as const,
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.convex.adminKey) {
    headers["Authorization"] = `Bearer ${config.convex.adminKey}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex mutation failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    status: string;
    errorMessage?: string;
    value?: unknown;
  };
  if (data.status === "error") {
    throw new Error(data.errorMessage ?? "Convex mutation error");
  }
}

/**
 * Write a batch of documents to Convex. Retries with backoff on failure.
 */
export async function writeTribeAppDataBatched(
  convexTable: string,
  documents: Record<string, unknown>[],
): Promise<any> {
  console.log("writing to convexbatch===>", documents.length);
  const result = await convex.mutation(api.migrations.bulkInsertUsers, {
    records: [
      {
        id: "id",
        name: "name",
        email: "email",
        createdAt: 0,
      },
    ],
  });
  console.log("result===>", result);
  return result;
  // return new Promise((resolve) => setTimeout(resolve, 100));
  if (documents.length === 0) return;
  const { retryAttempts, retryDelayMs } = config.migration;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      await callInsertBatch(convexTable, documents);
      logger.debug("Convex batch written", {
        table: convexTable,
        count: documents.length,
      });
      return;
    } catch (e: any) {
      lastError = e;
      logger.warn("Convex batch write attempt failed", {
        table: convexTable,
        attempt,
        retryAttempts,
        error: e?.message,
      });
      if (attempt < retryAttempts) {
        await sleep(retryDelayMs);
      }
    }
  }
  throw lastError ?? new Error("Convex batch write failed");
}

export async function writeCertificateAppDataBached(
  convexTable: string,
  documents: Record<string, unknown>[],
) {
  console.log("writing to convexbatch===>", documents.length);
  return new Promise((resolve) => setTimeout(resolve, 100));
}

export async function writeWordpressAppDataBached(
  convexTable: string,
  documents: Record<string, unknown>[],
) {
  console.log("writing to convexbatch===>", documents.length);
  return new Promise((resolve) => setTimeout(resolve, 100));
}
