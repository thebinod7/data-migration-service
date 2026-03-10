import express from "express";
import dotenv from "dotenv";
import { env } from "./config/env";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Hello from Express + TypeScript. This is " + env.APP_NAME,
  });
});

app.listen(env.PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
