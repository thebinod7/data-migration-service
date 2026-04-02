import mysql from "mysql2/promise";
import { config } from "../config";
import { MIGRATION_TABLE } from "../config/tables";

let pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.certificate_db.host,
      port: config.certificate_db.port,
      user: config.certificate_db.user,
      password: config.certificate_db.password,
      database: config.certificate_db.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

/** One campaign_recipients row plus related campaign and meta rows (for impact record migration). */
export type CampaignRecipientSourceRow = {
  recipient: Record<string, unknown>;
  campaign: Record<string, unknown> | null;
  metas: Record<string, unknown>[];
};

export async function fetchCampaignsByIds(
  ids: number[],
): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>();
  if (ids.length === 0) return map;

  const pool = getMysqlPool();
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `
    SELECT *
    FROM \`${MIGRATION_TABLE.LARAVEL.CAMPAIGNS}\`
    WHERE id IN (${placeholders})
    `,
    ids,
  );

  for (const row of rows as Record<string, unknown>[]) {
    map.set(Number(row.id), row);
  }
  return map;
}

/** Meta rows keyed by campaign_recipients.id (FK column on metas table: campaign_recipient_id). */
export async function fetchCampaignRecipientMetasByRecipientIds(
  recipientIds: number[],
): Promise<Map<number, Record<string, unknown>[]>> {
  const result = new Map<number, Record<string, unknown>[]>();

  // Remove invalid + duplicate IDs
  const ids = [...new Set(recipientIds)].filter((id) => Number.isFinite(id));

  if (ids.length === 0) return result;

  // Initialize map with empty arrays
  ids.forEach((id) => result.set(id, []));

  const pool = getMysqlPool();
  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `
    SELECT *
    FROM \`${MIGRATION_TABLE.LARAVEL.CAMPAIGN_RECIPIENT_METAS}\`
    WHERE campaign_recipient_id IN (${placeholders})
    `,
    ids,
  );

  // Group rows by campaign_recipient_id
  for (const row of rows as Record<string, unknown>[]) {
    const id = Number(row.campaign_recipient_id);

    // Since we pre-initialized, this will always exist
    result.get(id)!.push(row);
  }

  return result;
}

export async function enrichCampaignRecipientBatch(
  batch: Record<string, unknown>[],
): Promise<CampaignRecipientSourceRow[]> {
  const campaignIds = [
    ...new Set(
      batch
        .map((r) => Number(r.campaign_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  const recipientIds = batch.map((r) => Number(r.id));

  const [campaignsById, metasByRecipientId] = await Promise.all([
    fetchCampaignsByIds(campaignIds),
    fetchCampaignRecipientMetasByRecipientIds(recipientIds),
  ]);

  return batch.map((recipient) => {
    const cid = Number(recipient.campaign_id);
    return {
      recipient,
      campaign:
        Number.isFinite(cid) && cid > 0
          ? (campaignsById.get(cid) ?? null)
          : null,
      metas: metasByRecipientId.get(Number(recipient.id)) ?? [],
    };
  });
}

export async function* listCampaignRecipients(
  lastSeenId: number = 0,
  batchSize: number = 5,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();

  let currentId = Math.max(0, Number(lastSeenId) || 0);
  const limit = Math.max(1, Number(batchSize) || 5);

  while (true) {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM ${MIGRATION_TABLE.LARAVEL.CAMPAIGN_RECIPIENTS}
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ${limit}
      `,
      [currentId],
    );

    const batch = rows as Record<string, unknown>[];

    if (batch.length === 0) break;
    yield batch;
    currentId = batch[batch.length - 1].id as number;
  }
}

export async function* listBusinessImpactPages(
  lastSeenId: number = 0,
  batchSize: number = 5,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();

  let currentId = Math.max(0, Number(lastSeenId) || 0);
  const limit = Math.max(1, Number(batchSize) || 5);

  while (true) {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM ${MIGRATION_TABLE.LARAVEL.IMPACT_PAGES}
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ${limit}
      `,
      [currentId],
    );

    const batch = rows as Record<string, unknown>[];

    if (batch.length === 0) break;
    yield batch;
    currentId = batch[batch.length - 1].id as number;
  }
}

export async function* listPersonalImpactPages(
  lastSeenId: number = 0,
  batchSize: number = 5,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();

  let currentId = Math.max(0, Number(lastSeenId) || 0);
  const limit = Math.max(1, Number(batchSize) || 5);

  while (true) {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `
      SELECT *
      FROM ${MIGRATION_TABLE.LARAVEL.PERSONAL_IMPACT_PAGES}
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ${limit}
      `,
      [currentId],
    );

    const batch = rows as Record<string, unknown>[];

    if (batch.length === 0) break;
    yield batch;
    currentId = batch[batch.length - 1].id as number;
  }
}

export async function* extractCertificateAppDataBatched(
  table: string,
  pkColumn: string,
  batchSize: number,
  lastId: number | string | null,
): AsyncGenerator<Record<string, unknown>[]> {
  const pool = getMysqlPool();
  // await pool.query("SELECT 1");
  const total = await countMysqlRows(table);
  console.log("Total number of rows", { table, total });

  while (true) {
    const query = `
      SELECT * FROM \`${table}\`
      WHERE \`${pkColumn}\` > ?
      ORDER BY \`${pkColumn}\` ASC
      LIMIT ${batchSize}
    `;

    // Only lastId is passed as parameter
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, [
      lastId ?? 0,
    ]);

    const list = Array.isArray(rows) ? rows : [];

    if (!list.length) break;
    // Update lastId for next batch
    lastId = list[list.length - 1][pkColumn] as number | string;

    // Yield current batch
    yield list as Record<string, unknown>[];
  }

  console.log("Finished certficate app tables extraction", { table });
}

export async function countMysqlRows(table: string): Promise<number> {
  const pool = getMysqlPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM \`${table}\``,
  );
  const row = Array.isArray(rows) ? rows[0] : (rows as any)?.[0];
  return Number(row?.count ?? 0);
}

export async function closeCertificateMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
