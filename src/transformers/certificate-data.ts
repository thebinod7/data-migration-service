import type { Id } from "../../convex/_generated/dataModel";

/** Row shape from certificate app `image_templates` (or equivalent) API / MySQL. */
export type CertificateTemplateSourceRow = {
  id: number;
  campaign_type_id: number;
  name: string;
  slug: string;
  prefix: string;
  images: string;
  price_per_kg: string;
  kg_per_certificate: number;
  fixed_price: number;
  thumb_bg: string;
  width: number;
  height: number;
  thumb_width: number;
  active: number | boolean;
  valid_products: string;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

/** Convex `templates` document fields for insert (matches convex/schema.ts). */
export type ConvexTemplateInsert = {
  slug: string;
  name: string;
  description: string;
  backgroundImageId?: Id<"storedFiles">;
  width: number;
  height: number;
  textFields: Array<{
    fieldId: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    fontColor: string;
    textAlign: "left" | "center" | "right";
    maxWidth?: number;
  }>;
  certificatePrefix: string;
  supportedLanguages: string[];
  isActive: boolean;
  isRetired: boolean;
  createdAt: number;
  updatedAt: number;
};

function toMillis(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Maps certificate-app template rows into Convex `templates` table shape.
 * `images` / `thumb_bg` are filenames only; set `backgroundImageId` in a later pass after `storedFiles` exist.
 */
export function mapCertificateTemplateRowsToConvexTemplates(
  rows: CertificateTemplateSourceRow[],
): ConvexTemplateInsert[] {
  if (!rows.length) return [];

  return rows.map((row) => {
    const createdAt = toMillis(row.created_at) ?? Date.now();
    const updatedAt = toMillis(row.updated_at) ?? createdAt;
    const active = row.active;
    const isActive =
      typeof active === "boolean" ? active : Number(active) === 1;

    return {
      slug: row.slug,
      name: row.name,
      description: "",
      width: Number(row.width),
      height: Number(row.height),
      textFields: [],
      certificatePrefix: row.prefix,
      supportedLanguages: [],
      isActive,
      isRetired: false,
      createdAt,
      updatedAt,
    };
  });
}

// Not in use
export const mapUsersFieldsToConvexAccount = (users: any[]) => {
  if (!users.length) return [];
  return users.map((user) => {
    return {
      name: user.name,
      type: user.type, // TODO: personal or business??
      slug: generateSlug(), // TODO: fix slug
      ownerId: String(user.id),
      createdAt: new Date(user.created_at).getTime(),
      updatedAt: new Date(user.updated_at).getTime(),
    };
  });
};

const generateSlug = () => {
  return Math.random().toString(36).substring(2, 15);
};
