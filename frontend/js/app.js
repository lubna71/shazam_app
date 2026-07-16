// app.js - wires up the UI to the fingerprinting engine and backend API

const API_BASE = window.API_BASE_URL || "http://localhost:5000";

// ---------- Add Song ----------
const addSongForm = document.getElementById("add-song-form");
const addSongStatus = document.getElementById("add-song-status");

addSongForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("song-title").value.trim();
  const artist = document.getElementById("song-artist").value.trim();
  const fileInput = document.getElementById("song-file");
  const file = fileInput.files[0];

  if (!title || !file) {
    addSongStatus.textContent = "Title aur audio file dono required hain.";
    return;
  }

  try {
    addSongStatus.textContent = "Analyzing audio & generating fingerprints...";
    const hashes = await FingerprintEngine.fingerprintAudio(file);

    if (hashes.length === 0) {
      addSongStatus.textContent = "Koi fingerprint nahi bana - dusra audio file try karein.";
      return;
    }

    addSongStatus.textContent = `Uploading ${hashes.length} fingerprints...`;
    const res = await fetch(`${API_BASE}/api/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist, hashes }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Upload failed");

    addSongStatus.textContent = `"${title}" added successfully (${data.fingerprintCount} fingerprints).`;
    addSongForm.reset();
    loadSongList();
  } catch (err) {
    console.error(err);
    addSongStatus.textContent = `Error: ${err.message}`;
  }
});

// ---------- Song List ----------
async function loadSongList() {
  const list = document.getElementById("song-list");
  list.innerHTML = "Loading...";
  try {
    const res = await fetch(`${API_BASE}/api/songs`);
    const songs = await res.json();
    if (songs.length === 0) {
      list.innerHTML = "<li>No songs in database yet.</li>";
      return;
    }
    list.innerHTML = songs
      .map(
        (s) =>
          `<li><strong>${s.title}</strong>${s.artist ? " - " + s.artist : ""} 
           <span class="muted">(${s.fingerprint_count} fingerprints)</span></li>`
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<li>Error loading songs: ${err.message}</li>`;
  }
}

// ---------- Identify (Mic Recording) ----------
const recordBtn = document.getElementById("record-btn");
const identifyStatus = document.getElementById("identify-status");
const resultBox = document.getElementById("result-box");

const RECORD_DURATION_MS = 8000; // 8-second listening window

recordBtn.addEventListener("click", async () => {
  resultBox.innerHTML = "";
  try {
    recordBtn.disabled = true;
    identifyStatus.textContent = "Requesting microphone access...";

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    const recordingDone = new Promise((resolve) => {
      mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
    });

    mediaRecorder.start();
    identifyStatus.textContent = "Listening... (8 seconds)";
    await new Promise((r) => setTimeout(r, RECORD_DURATION_MS));
    mediaRecorder.stop();
    stream.getTracks().forEach((t) => t.stop());

    const blob = await recordingDone;

    identifyStatus.textContent = "Analyzing recording...";
    const hashes = await FingerprintEngine.fingerprintAudio(blob);

    if (hashes.length === 0) {
      identifyStatus.textContent = "Recording se koi usable fingerprint nahi mila. Try again.";
      return;
    }

    identifyStatus.textContent = "Matching against database...";
    const res = await fetch(`${API_BASE}/api/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes }),
    });
    const data = await res.json();

    if (data.match) {
      identifyStatus.textContent = "Match found!";
      resultBox.innerHTML = `
        <div class="match-card">
          <h3>${data.match.song.title}</h3>
          <p>${data.match.song.artist || ""}</p>
          <p class="muted">Confidence score: ${data.match.confidence}</p>
        </div>`;
    } else {
      identifyStatus.textContent = "Koi match nahi mila.";
      resultBox.innerHTML = `<p class="muted">${data.reason || "Try recording closer to the audio source."}</p>`;
    }
  } catch (err) {
    console.error(err);
    identifyStatus.textContent = `Error: ${err.message}`;
  } finally {
    recordBtn.disabled = false;
  }
});

loadSongList();