function rowLabel(row: Record<string, unknown>): string {
  const id = row.id ?? row.ID;
  return id != null && String(id).trim() !== "" ? String(id) : "?";
}

function firstDefinedRaw(
  row: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (!(key in row)) continue;
    const v = row[key];
    if (v == null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return v;
  }
  return undefined;
}

/**
 * Parse Laravel JSON/text columns: accepts already-parsed objects or JSON strings.
 * Malformed JSON logs once per row+field and returns null.
 */
function tryParseJsonField(
  raw: unknown,
  row: Record<string, unknown>,
  fieldName: string,
): unknown | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  const s = String(raw).trim();
  if (s === "" || s.toLowerCase() === "null") return null;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    console.warn(
      `[migration] Malformed JSON in ${fieldName} for impact row id=${rowLabel(row)}`,
    );
    return null;
  }
}

function normalizeDescriptionVariant(
  o: unknown,
  locale?: string,
): { header: string; body: string; locale?: string } | null {
  if (typeof o !== "object" || o === null) return null;
  const rec = o as Record<string, unknown>;
  const header = rec.header != null ? String(rec.header).trim() : "";
  const body = rec.body != null ? String(rec.body).trim() : "";
  if (header === "" && body === "") return null;
  const base = { header, body };
  return locale !== undefined ? { ...base, locale } : base;
}

function descriptionVariantsFromParsed(parsed: unknown): unknown[] {
  if (parsed == null) return [];

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => normalizeDescriptionVariant(item))
      .filter((v): v is NonNullable<typeof v> => v != null);
  }

  if (typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.variants)) {
    return obj.variants
      .map((item) => normalizeDescriptionVariant(item))
      .filter((v): v is NonNullable<typeof v> => v != null);
  }

  const single = normalizeDescriptionVariant(parsed);
  if (single) return [single];

  const fromLocales: unknown[] = [];
  for (const [locale, val] of Object.entries(obj)) {
    if (typeof val !== "object" || val === null) continue;
    const inner = val as Record<string, unknown>;
    if (!("header" in inner) && !("body" in inner)) continue;
    const nv = normalizeDescriptionVariant(val, locale);
    if (nv) fromLocales.push(nv);
  }
  return fromLocales;
}

function normalizeQuoteVariant(
  o: unknown,
  locale?: string,
): { name: string; position: string; quote: string; locale?: string } | null {
  if (typeof o !== "object" || o === null) return null;
  const rec = o as Record<string, unknown>;
  const name = rec.name != null ? String(rec.name).trim() : "";
  const position = rec.position != null ? String(rec.position).trim() : "";
  const quote = rec.quote != null ? String(rec.quote).trim() : "";
  if (name === "" && position === "" && quote === "") return null;
  const base = { name, position, quote };
  return locale !== undefined ? { ...base, locale } : base;
}

function quoteVariantsFromParsed(parsed: unknown): unknown[] {
  if (parsed == null) return [];

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => normalizeQuoteVariant(item))
      .filter((v): v is NonNullable<typeof v> => v != null);
  }

  if (typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.variants)) {
    return obj.variants
      .map((item) => normalizeQuoteVariant(item))
      .filter((v): v is NonNullable<typeof v> => v != null);
  }

  const single = normalizeQuoteVariant(parsed);
  if (single) return [single];

  const fromLocales: unknown[] = [];
  for (const [locale, val] of Object.entries(obj)) {
    if (typeof val !== "object" || val === null) continue;
    const inner = val as Record<string, unknown>;
    if (
      !("name" in inner) &&
      !("position" in inner) &&
      !("quote" in inner)
    ) {
      continue;
    }
    const nv = normalizeQuoteVariant(val, locale);
    if (nv) fromLocales.push(nv);
  }
  return fromLocales;
}

/**
 * Build `profileSections.config`-compatible objects from Laravel `impact_pages` /
 * `personal_impact_pages` JSON columns. Parsing rules live only in this module.
 */
export function profileSectionConfigsFromImpactRow(
  row: Record<string, unknown>,
  accountType: "business" | "personal",
): unknown[] {
  const out: unknown[] = [];

  if (accountType === "business") {
    const descRaw = firstDefinedRaw(row, [
      "company_description",
      "companyDescription",
    ]);
    const descParsed = tryParseJsonField(
      descRaw,
      row,
      "company_description",
    );
    const descVariants = descriptionVariantsFromParsed(descParsed);
    if (descVariants.length > 0) {
      out.push({ type: "description", variants: descVariants });
    }

    const quoteRaw = firstDefinedRaw(row, ["company_quote", "companyQuote"]);
    const quoteParsed = tryParseJsonField(quoteRaw, row, "company_quote");
    const quoteVariants = quoteVariantsFromParsed(quoteParsed);
    if (quoteVariants.length > 0) {
      out.push({ type: "quote", variants: quoteVariants });
    }

    return out;
  }

  // personal
  const descRaw = firstDefinedRaw(row, ["description"]);
  const descParsed = tryParseJsonField(descRaw, row, "description");
  const descVariants = descriptionVariantsFromParsed(descParsed);
  if (descVariants.length > 0) {
    out.push({ type: "description", variants: descVariants });
  }

  return out;
}
