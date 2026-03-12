import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

const DEFAULT_CHECKPOINT_PATH = path.resolve(process.cwd(), ".migration-checkpoint.json");

export type CheckpointState = {
  /** Per convexTable: last primary key value successfully processed (inclusive). */
  tables: Record<string, { lastPrimaryKey: number | string }>;
};

let checkpointPath = DEFAULT_CHECKPOINT_PATH;
let disabled = false;

export function setCheckpointPath(p: string) {
  checkpointPath = p;
}

export function isCheckpointDisabled(): boolean {
  return disabled;
}

export function setCheckpointDisabled(value: boolean) {
  disabled = value;
}

/** Initialize from env: SKIP_CHECKPOINT=1 or NO_CHECKPOINT=1 to disable. */
export function initCheckpointFromEnv() {
  if (process.env.SKIP_CHECKPOINT === "true" || process.env.SKIP_CHECKPOINT === "1" ||
      process.env.NO_CHECKPOINT === "true" || process.env.NO_CHECKPOINT === "1") {
    disabled = true;
    logger.info("Checkpoint disabled via env");
  }
}

export function readCheckpoint(): CheckpointState | null {
  if (disabled) return null;
  try {
    const raw = fs.readFileSync(checkpointPath, "utf-8");
    const data = JSON.parse(raw) as CheckpointState;
    if (data && typeof data.tables === "object") return data;
  } catch (e: any) {
    if (e?.code !== "ENOENT") logger.warn("Failed to read checkpoint", { path: checkpointPath, error: e?.message });
  }
  return null;
}

export function writeCheckpoint(state: CheckpointState): void {
  if (disabled) return;
  try {
    fs.writeFileSync(checkpointPath, JSON.stringify(state, null, 2), "utf-8");
  } catch (e: any) {
    logger.warn("Failed to write checkpoint", { path: checkpointPath, error: e?.message });
  }
}

/** Get last primary key for a table if any. */
export function getLastPrimaryKey(convexTable: string): number | string | null {
  const state = readCheckpoint();
  if (!state?.tables[convexTable]) return null;
  return state.tables[convexTable].lastPrimaryKey;
}

/** Update checkpoint after successfully processing a batch for convexTable. */
export function saveCheckpoint(convexTable: string, lastPrimaryKey: number | string): void {
  const state = readCheckpoint() ?? { tables: {} };
  state.tables[convexTable] = { lastPrimaryKey };
  writeCheckpoint(state);
}

/** Clear checkpoint (e.g. for full re-run). */
export function clearCheckpoint(): void {
  if (disabled) return;
  try {
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
      logger.info("Checkpoint cleared", { path: checkpointPath });
    }
  } catch (e: any) {
    logger.warn("Failed to clear checkpoint", { path: checkpointPath, error: e?.message });
  }
}
