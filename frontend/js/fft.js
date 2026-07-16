// fft.js
// A from-scratch iterative radix-2 Cooley-Tukey FFT.
// No external DSP library is used - this is the core "built from scratch"
// signal processing piece of the fingerprinting pipeline.

function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Iterative Cooley-Tukey
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWRe = 1;
      let curWIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curWRe - im[i + j + len / 2] * curWIm;
        const vIm = re[i + j + len / 2] * curWIm + im[i + j + len / 2] * curWRe;

        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;

        const nextWRe = curWRe * wRe - curWIm * wIm;
        const nextWIm = curWRe * wIm + curWIm * wRe;
        curWRe = nextWRe;
        curWIm = nextWIm;
      }
    }
  }
}

// Compute magnitude spectrum of a real-valued windowed frame.
function magnitudeSpectrum(frame) {
  const n = frame.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(frame);
  fft(re, im);
  const mags = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return mags;
}

// Hann window - reduces spectral leakage before FFT
function hannWindow(size) {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

window.ShazamFFT = { fft, magnitudeSpectrum, hannWindow };