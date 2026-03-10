import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 3000,
  APP_NAME: process.env.APP_NAME || "My App",
  POSTGRES: {
    DATABASE_URL: "postgresql://db_name",
  },
};
