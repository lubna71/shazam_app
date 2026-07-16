// fingerprint.js
// From-scratch audio fingerprinting pipeline (Shazam-style), built entirely
// on top of our own FFT (fft.js) and the browser's Web Audio API for
// decoding/resampling raw audio. No third-party recognition/fingerprinting
// service is used anywhere in this file.

const FingerprintEngine = (() => {
  const TARGET_SAMPLE_RATE = 11025; // downsample: enough for recognition, keeps FFT small
  const WINDOW_SIZE = 4096; // power of 2, ~0.37s per frame at 11025Hz
  const HOP_SIZE = 2048; // 50% overlap

  // Frequency bands (in FFT bin index) used for per-band peak picking
  const BANDS = [
    [0, 10],
    [10, 20],
    [20, 40],
    [40, 80],
    [80, 160],
    [160, 511],
  ];

  const FAN_OUT = 5; // how many target points to pair with each anchor
  const MIN_TIME_DELTA = 1; // frames
  const MAX_TIME_DELTA = 63; // frames

  let hannWin = null;

  // Decode an audio Blob/File into a mono Float32Array resampled to
  // TARGET_SAMPLE_RATE, using the Web Audio API.
  async function decodeToMonoPCM(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
    tempCtx.close();

    const duration = decoded.duration;
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil(duration * TARGET_SAMPLE_RATE),
      TARGET_SAMPLE_RATE
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;

    if (decoded.numberOfChannels > 1) {
      const splitter = offlineCtx.createChannelSplitter(decoded.numberOfChannels);
      source.connect(splitter);
      const gain = offlineCtx.createGain();
      gain.gain.value = 1 / decoded.numberOfChannels;
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        splitter.connect(gain, ch);
      }
      gain.connect(offlineCtx.destination);
    } else {
      source.connect(offlineCtx.destination);
    }

    source.start(0);
    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
  }

  // Build a "constellation map" of (time, frequencyBin) peaks
  function buildConstellation(pcm) {
    hannWin = hannWin || ShazamFFT.hannWindow(WINDOW_SIZE);
    const peaks = [];
    const numFrames = Math.floor((pcm.length - WINDOW_SIZE) / HOP_SIZE);

    for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      const start = frameIdx * HOP_SIZE;
      const frame = new Float64Array(WINDOW_SIZE);
      for (let i = 0; i < WINDOW_SIZE; i++) {
        frame[i] = pcm[start + i] * hannWin[i];
      }

      const mags = ShazamFFT.magnitudeSpectrum(frame);

      let avg = 0;
      for (let i = 0; i < mags.length; i++) avg += mags[i];
      avg /= mags.length;
      const threshold = avg * 2.0;

      for (const [lo, hi] of BANDS) {
        let maxMag = 0;
        let maxBin = -1;
        for (let bin = lo; bin < hi && bin < mags.length; bin++) {
          if (mags[bin] > maxMag) {
            maxMag = mags[bin];
            maxBin = bin;
          }
        }
        if (maxBin !== -1 && maxMag > threshold) {
          peaks.push({ time: frameIdx, freqBin: maxBin });
        }
      }
    }

    return peaks;
  }

  // Combinatorial hashing: pair each anchor peak with nearby target peaks
  function generateHashes(peaks) {
    peaks.sort((a, b) => a.time - b.time);
    const hashes = [];

    for (let i = 0; i < peaks.length; i++) {
      const anchor = peaks[i];
      let pairsFound = 0;

      for (let j = i + 1; j < peaks.length && pairsFound < FAN_OUT; j++) {
        const target = peaks[j];
        const dt = target.time - anchor.time;
        if (dt < MIN_TIME_DELTA) continue;
        if (dt > MAX_TIME_DELTA) break;

        const hash = `${anchor.freqBin}-${target.freqBin}-${dt}`;
        hashes.push({ hash, offset: anchor.time });
        pairsFound++;
      }
    }

    return hashes;
  }

  // Full pipeline: audio Blob/File -> array of { hash, offset } fingerprints.
  async function fingerprintAudio(blob) {
    hannWin = hannWin || ShazamFFT.hannWindow(WINDOW_SIZE);
    const pcm = await decodeToMonoPCM(blob);
    const peaks = buildConstellation(pcm);
    return generateHashes(peaks);
  }

  return { fingerprintAudio };
})();