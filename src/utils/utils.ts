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
