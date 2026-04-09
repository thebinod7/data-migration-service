import fs from "node:fs";
import path from "node:path";
import { LOCAL_JSON_MAP } from "../constants/contants";

export const splitFullName = (
  fullName: string,
): { firstName: string; lastName: string } => {
  const nameParts = fullName.trim().split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "";
  return { firstName, lastName };
};

// generate slug from company name by lowercasing and replacing spaces with dashes
export const generateSlug = (companyName: string): string => {
  return companyName.trim().toLowerCase().replace(/\s+/g, "-");
};

export const parseDateToTimestamp = (date: string | Date): number => {
  const parsedDate = date instanceof Date ? date : new Date(date);
  return parsedDate.getTime();
};


export const parseOffsetCheckpoint = (raw: number | string | null): number => {
  if (raw == null) return 0;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  }
  if (typeof raw === "string") {
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
  }
  return 0;
}


export const readProgramIdsBySlug = (): Record<string, string> => {
  const filePath = path.resolve(process.cwd(), LOCAL_JSON_MAP.PROGRAMS_BY_SLUG);
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}