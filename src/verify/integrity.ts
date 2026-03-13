import { config } from "../config";
import type { TableConfig } from "../config";
import { logger } from "../utils/logger";
import { countPgRows } from "../extractors/postgres";
import { countMysqlRows } from "../extractors/mysql";

const CONVEX_QUERY_GET_COUNT = "migrations:getCount";

async function getConvexCount(convexTable: string): Promise<number | null> {
  try {
    const url = `${config.convex.deploymentUrl.replace(/\/$/, "")}/api/query`;
    const body = {
      path: CONVEX_QUERY_GET_COUNT,
      args: { table: convexTable },
      format: "json" as const,
    };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.convex.adminKey) {
      headers["Authorization"] = `Bearer ${config.convex.adminKey}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; value?: number };
    if (data.status === "success" && typeof data.value === "number") return data.value;
  } catch (_) {
    // ignore
  }
  return null;
}

export type VerifyResult = {
  table: string;
  sourceCount: number;
  convexCount: number | null;
  match: boolean;
  message: string;
};

export async function verifyTable(tableConfig: TableConfig): Promise<VerifyResult> {
  const { sourceTable, convexTable, source } = tableConfig;
  let sourceCount: number;
  if (source === "postgres") {
    sourceCount = await countPgRows(sourceTable);
  } else {
    sourceCount = await countMysqlRows(sourceTable);
  }
  const convexCount = await getConvexCount(convexTable);
  const match = convexCount !== null && sourceCount === convexCount;
  const message =
    convexCount === null
      ? `Source: ${sourceCount}. Convex count unavailable (deploy migrations:getCount for full verification).`
      : match
        ? `Source: ${sourceCount}, Convex: ${convexCount} — match.`
        : `Mismatch: source=${sourceCount}, Convex=${convexCount}`;
  return {
    table: convexTable,
    sourceCount,
    convexCount,
    match,
    message,
  };
}

export async function verifyAll(
  tables: TableConfig[]
): Promise<{ results: VerifyResult[]; allPassed: boolean }> {
  const results: VerifyResult[] = [];
  for (const t of tables) {
    const r = await verifyTable(t);
    results.push(r);
    logger.info("Verify", { table: r.table, sourceCount: r.sourceCount, convexCount: r.convexCount, match: r.match, message: r.message });
  }
  const withConvex = results.filter((r) => r.convexCount !== null);
  const allPassed =
    withConvex.length === 0 || withConvex.every((r) => r.match);
  return { results, allPassed };
}
