import express from "express";
import dotenv from "dotenv";
import { env } from "./config/env";
import { listTribes, testPgConnection } from "./extractors/postgres";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/", async (req, res) => {
  const rows = await listTribes();
  res.json({
    message: "Hello from Express + TypeScript. This is " + env.APP_NAME,
    rows,
  });
});

app.listen(env.PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
