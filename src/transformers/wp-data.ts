// type MySQLUser = {
//   ID: number;
//   user_email: string;
//   display_name: string;
//   user_registered: Date | string;
//   role: "user" | "admin";
// };

type ConvexUser = {
  ssoUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  createdAt: number;
  updatedAt: number;
};

export function mapWordpressUsersToConvex(mysqlUsers: any[]): ConvexUser[] {
  const seen = new Set<number>();

  return mysqlUsers
    .filter((user) => {
      // Remove duplicates based on ID
      if (seen.has(user.ID)) return false;
      seen.add(user.ID);
      return true;
    })
    .map((user) => {
      // Split name safely
      const nameParts = (user.display_name || "").trim().split(" ");
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Normalize date
      const createdAtDate = new Date(user.user_registered);
      const createdAt = isNaN(createdAtDate.getTime())
        ? Date.now()
        : createdAtDate.getTime();

      return {
        ssoUserId: String(user.ID),
        email: user.user_email,
        firstName,
        lastName,
        role: user.role || "user",
        createdAt,
        updatedAt: createdAt,
      };
    });
}
