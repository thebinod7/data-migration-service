export const splitFullName = (
  fullName: string,
): { firstName: string; lastName: string } => {
  const nameParts = fullName.trim().split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "";
  return { firstName, lastName };
};
