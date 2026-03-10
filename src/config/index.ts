export const tables = [
  {
    source: "mysql" as const,
    sourceTable: "users",
    convexTable: "users",
    primaryKey: "id",
    transform: "transformUser",
  },
  {
    source: "postgres" as const,
    sourceTable: "tribes",
    convexTable: "tribes",
    primaryKey: "id",
    transform: "transformOrder",
  },
];
