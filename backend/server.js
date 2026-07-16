// server.js - entry point for the backend API
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const songsRouter = require("./routes/songs");
const identifyRouter = require("./routes/identify");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" })); // fingerprint payloads can be large

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Shazam-clone backend running" });
});

app.use("/api/songs", songsRouter);
app.use("/api/identify", identifyRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});