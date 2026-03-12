export type TransformFn = (row: Record<string, unknown>) => Record<string, unknown>;

/** Normalize a value for Convex (JSON-serializable). */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return String(value);
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeValue(v);
    return out;
  }
  return value;
}

/** Default pass-through: normalize types and add sourceId. */
function defaultTransform(
  row: Record<string, unknown>,
  primaryKey: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = normalizeValue(value);
  }
  const pk = row[primaryKey];
  out.sourceId = pk === undefined || pk === null ? undefined : normalizeValue(pk);
  return out;
}

const registry: Record<string, TransformFn> = {
  transformUser(row: Record<string, unknown>): Record<string, unknown> {
    const out = defaultTransform(row, "id");
    return out;
  },
  transformTribe(row: Record<string, unknown>): Record<string, unknown> {
    const out = defaultTransform(row, "id");
    return out;
  },
  transformProduct(row: Record<string, unknown>): Record<string, unknown> {
    const out = defaultTransform(row, "id");
    return out;
  },
};

export function registerTransform(name: string, fn: TransformFn): void {
  registry[name] = fn;
}

export function getTransform(
  transformName: string,
  primaryKey: string
): TransformFn {
  const fn = registry[transformName];
  return (row: Record<string, unknown>) => {
    const out = fn ? fn(row) : defaultTransform(row, primaryKey);
    const doc = { ...out } as Record<string, unknown>;
    if (!("sourceId" in doc) || doc.sourceId === undefined) {
      doc.sourceId = normalizeValue(row[primaryKey]);
    }
    return doc;
  };
}

export function transformBatch(
  rows: Record<string, unknown>[],
  transformFn: TransformFn
): Record<string, unknown>[] {
  return rows.map((row) => transformFn(row));
}
