// routes/songs.js
// POST /api/songs  -> add a reference song + its fingerprints to the database
// GET  /api/songs   -> list all songs in the database
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Add a new song along with its precomputed fingerprints.
// Body: { title, artist, hashes: [{ hash: "f1-f2-dt", offset: number }, ...] }
router.post("/", async (req, res) => {
  const { title, artist, hashes } = req.body;

  if (!title || !Array.isArray(hashes) || hashes.length === 0) {
    return res.status(400).json({ error: "title and non-empty hashes[] are required" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [songResult] = await connection.query(
      "INSERT INTO songs (title, artist) VALUES (?, ?)",
      [title, artist || null]
    );
    const songId = songResult.insertId;

    // Bulk insert fingerprints in batches to avoid huge single queries
    const BATCH_SIZE = 2000;
    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batch = hashes.slice(i, i + BATCH_SIZE);
      const values = batch.map((h) => [songId, h.hash, h.offset]);
      await connection.query(
        "INSERT INTO fingerprints (song_id, hash, offset_frame) VALUES ?",
        [values]
      );
    }

    await connection.commit();
    res.json({ success: true, songId, fingerprintCount: hashes.length });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to save song" });
  } finally {
    connection.release();
  }
});

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.title, s.artist, s.created_at, COUNT(f.id) AS fingerprint_count
       FROM songs s LEFT JOIN fingerprints f ON f.song_id = s.id
       GROUP BY s.id ORDER BY s.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch songs" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM songs WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete song" });
  }
});

module.exports = router;