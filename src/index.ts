import express from "express";

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Hello from Express + TypeScript 🚀",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
