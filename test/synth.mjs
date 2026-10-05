// Shared synthesis helpers for the node tests: guitar-like strums, plucks, noise, hum, clicks, a lowpass.
// Deterministic: call setSeed() before each scenario.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CH = require("../chords.js");
export const SR = 48000;

// ---------- seeded randomness ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rnd = mulberry32(1234);
export const setSeed = s => { rnd = mulberry32(s); };
export const random = () => rnd();
export const uni = (a, b) => a + (b - a) * rnd();
export const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / Math.sqrt(0.5); };

// ---------- guitar-ish synthesis ----------
export const SHAPES = CH.CHORDS;
export const OPEN = CH.OPEN_MIDI; // E2 A2 D3 G3 B3 E4
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// Adds one strum into buf starting at sample s0. muteAt (samples, absolute) damps it quickly.
export function addStrum(buf, chord, s0, o = {}) {
  const vel = o.vel ?? uni(0.35, 1), strumMs = o.strumMs ?? uni(4, 14), up = o.up ?? rnd() < 0.2;
  const bright = uni(0.7, 1.4), muteAt = o.muteAt ?? Infinity, maxLen = o.maxLen ?? buf.length;
  let strings = SHAPES[chord].map((f, i) => [f, i]).filter(([f]) => f >= 0);
  if (o.only) strings = strings.filter(([, i]) => o.only.includes(i));
  const dropped = [];
  if (up) strings.reverse();
  strings.forEach(([fret, si], order) => {
    if (o.dropString && rnd() < 0.08) { dropped.push(si); return; } // occasionally a string doesn't sound
    const f0 = mtof(OPEN[si] + fret) * Math.pow(2, uni(-8, 8) / 1200);
    const start = s0 + Math.round((order * strumMs + uni(0, 2)) * SR / 1000);
    const amp = (o.amp ?? 0.09) * vel * uni(0.6, 1.0) * (si < 2 ? 1.1 : 1);
    const tau0 = uni(1.2, 2.6);
    for (let h = 1; h <= 12; h++) {
      const fh = h * f0 * Math.sqrt(1 + 1e-4 * h * h);
      if (fh > SR / 2 - 1000) break;
      const a = amp * Math.pow(h, -bright) * uni(0.5, 1.2) * (h === 1 && si < 2 ? 0.6 : 1);
      const tau = tau0 / (1 + 0.35 * (h - 1));
      const w = 2 * Math.PI * fh / SR, cr = Math.cos(w), ci = Math.sin(w);
      let re = a, im = 0;
      const dec = Math.exp(-1 / (tau * SR)), mdec = Math.exp(-1 / (0.03 * SR));
      const end = Math.min(buf.length, start + maxLen);
      for (let n = Math.max(0, start), k = 0; n < end; n++, k++) {
        const att = k < 144 ? k / 144 : 1; // 3 ms attack
        buf[n] += im * att;
        const nr = (re * cr - im * ci) * dec, ni = (re * ci + im * cr) * dec;
        re = nr; im = ni;
        if (n >= muteAt) { re *= mdec; im *= mdec; }
        if (k > 2000 && Math.abs(re) + Math.abs(im) < 1e-6) break;
      }
    }
    // pick / finger noise
    for (let n = 0; n < 240; n++) if (start + n < buf.length && start + n >= 0) buf[start + n] += gauss() * 0.01 * vel * (1 - n / 240);
  });
  return dropped;
}

export function addNoise(buf, level, from = 0, to = buf.length) {
  for (let n = from; n < to; n++) buf[n] += gauss() * level;
}
export function addHum(buf, level) { // 60 Hz mains hum with a few harmonics
  for (let n = 0; n < buf.length; n++) { const t = n / SR; buf[n] += level * (Math.sin(2 * Math.PI * 60 * t) + 0.5 * Math.sin(2 * Math.PI * 120 * t) + 0.3 * Math.sin(2 * Math.PI * 180 * t)); }
}


// One plucked string note (harmonics; fundamentalGain < 1 models a weak fundamental, e.g. low E through a small mic).
export function addPluck(buf, midi, s0, o = {}) {
  const f0 = mtof(midi) * Math.pow(2, (o.cents ?? 0) / 1200), amp = o.amp ?? 0.15, tau0 = o.tau ?? 1.5;
  const len = Math.min(buf.length, s0 + (o.len ?? buf.length));
  for (let h = 1; h <= 10; h++) {
    const fh = h * f0 * Math.sqrt(1 + 1e-4 * h * h);
    if (fh > SR / 2 - 1000) break;
    const a = amp * Math.pow(h, -1) * (h === 1 ? (o.fundamentalGain ?? 1) : 1), tau = tau0 / (1 + 0.3 * (h - 1));
    const w = 2 * Math.PI * fh / SR, dec = Math.exp(-1 / (tau * SR)), mdec = Math.exp(-1 / (0.02 * SR));
    let re = a, im = 0; const cr = Math.cos(w), ci = Math.sin(w);
    for (let n = s0, k = 0; n < len; n++, k++) {
      buf[n] += im * (k < 96 ? k / 96 : 1);
      const nr = (re * cr - im * ci) * dec, ni = (re * ci + im * cr) * dec; re = nr; im = ni;
      if (o.muteAt != null && n >= o.muteAt) { re *= mdec; im *= mdec; }
    }
  }
}

// Short high metronome click (what leaks from a speaker into the mic).
export function addClick(buf, s0, level = 0.05, hz = 2500) {
  const att = SR * 0.0025;
  for (let k = 0; k < SR * 0.02; k++) { const n = s0 + k; if (n >= buf.length) break;
    const env = k < att ? 0.5 - 0.5 * Math.cos(Math.PI * k / att) : Math.exp(-(k - att) / (SR * 0.004));
    buf[n] += level * env * Math.sin(2 * Math.PI * hz * k / SR); }
}

// RBJ biquad lowpass, same response family as the browser's BiquadFilterNode.
export function lowpass(buf, fc, q = 0.707) {
  const w = 2 * Math.PI * fc / SR, al = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + al;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
  const out = new Float32Array(buf.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < buf.length; n++) { const x = buf[n], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; out[n] = y; x2 = x1; x1 = x; y2 = y1; y1 = y; }
  return out;
}

// RBJ biquad highpass.
export function highpass(buf, fc, q = 0.707) {
  const w = 2 * Math.PI * fc / SR, al = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + al;
  const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
  const out = new Float32Array(buf.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < buf.length; n++) { const x = buf[n], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; out[n] = y; x2 = x1; x1 = x; y2 = y1; y1 = y; }
  return out;
}
