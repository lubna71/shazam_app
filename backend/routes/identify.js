// routes/identify.js
// POST /api/identify -> match a short recording's fingerprints against the DB
//
// The matching algorithm (classic Shazam-style approach):
// 1. Look up every hash from the query clip in the fingerprints table.
// 2. Each match gives us (song_id, db_offset, query_offset).
// 3. For a TRUE match, many of these pairs will share the same
//    (db_offset - query_offset) delta, because the query clip is just a
//    time-shifted snippet of the original song.
// 4. For each candidate song, build a histogram of deltas. The song whose
//    histogram has the tallest peak (most aligned matches) wins.
const express = require("express");
const router = express.Router();
const pool = require("../db");

const MIN_MATCHES_REQUIRED = 25; // minimum aligned hash matches to accept a result

router.post("/", async (req, res) => {
  const { hashes } = req.body;

  if (!Array.isArray(hashes) || hashes.length === 0) {
    return res.status(400).json({ error: "non-empty hashes[] is required" });
  }

  try {
    const hashList = hashes.map((h) => h.hash);
    // Map hash -> query offset for quick lookup after the DB query
    const queryOffsetByHash = new Map();
    for (const h of hashes) queryOffsetByHash.set(h.hash, h.offset);

    // Chunk the IN(...) query since there can be thousands of hashes
    const CHUNK = 1000;
    let rows = [];
    for (let i = 0; i < hashList.length; i += CHUNK) {
      const chunk = hashList.slice(i, i + CHUNK);
      const [r] = await pool.query(
        "SELECT song_id, hash, offset_frame FROM fingerprints WHERE hash IN (?)",
        [chunk]
      );
      rows = rows.concat(r);
    }

    if (rows.length === 0) {
      return res.json({ match: null, reason: "no matching fingerprints found" });
    }

    // songId -> { delta -> count }
    const histograms = new Map();

    for (const row of rows) {
      const queryOffset = queryOffsetByHash.get(row.hash);
      if (queryOffset === undefined) continue;
      const delta = row.offset_frame - queryOffset;

      if (!histograms.has(row.song_id)) histograms.set(row.song_id, new Map());
      const hist = histograms.get(row.song_id);
      hist.set(delta, (hist.get(delta) || 0) + 1);
    }

    // Find the song with the single best-aligned delta peak
    let bestSongId = null;
    let bestCount = 0;
    let bestDelta = null;

    for (const [songId, hist] of histograms.entries()) {
      for (const [delta, count] of hist.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestSongId = songId;
          bestDelta = delta;
        }
      }
    }

    if (!bestSongId || bestCount < MIN_MATCHES_REQUIRED) {
      return res.json({ match: null, reason: "no confident match", bestCount });
    }

    const [songRows] = await pool.query("SELECT * FROM songs WHERE id = ?", [bestSongId]);
    if (songRows.length === 0) {
      return res.json({ match: null, reason: "song record missing" });
    }

    res.json({
      match: {
        song: songRows[0],
        confidence: bestCount,
        alignedOffsetDelta: bestDelta,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to identify song" });
  }
});

module.exports = router;