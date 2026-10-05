// Synthetic tests for dsp.js. Run: node test/dsp.test.mjs  (no dependencies)
// These use additive-synthesis "guitar-like" strums, not recordings. Passing them shows the
// pipeline is wired correctly and the constants are sane; it does NOT prove real-guitar accuracy.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D = require("../dsp.js");
const { C } = D;
if (process.env.DSP_OVERRIDE) Object.assign(C, JSON.parse(process.env.DSP_OVERRIDE)); // for tuning experiments

const SR = 48000, N = C.FFT_SIZE, HOP = Math.round(SR * C.HOP_MS / 1000);
const WIN = D.blackman(N);
import { SR as _SR, setSeed, uni, addStrum, addNoise, addHum } from "./synth.mjs";

// Run the same frame pipeline the page uses: every HOP, take the last N samples, Blackman, |FFT|/N, RMS of last 1024.
function analyse(buf, analyzer, onEvent) {
  for (let end = HOP; end <= buf.length; end += HOP) {
    const mag = D.magnitudeSpectrum(buf, end, WIN);
    const level = D.rms(buf.subarray(Math.max(0, end - 1024), end));
    const t = end / SR * 1000;
    const evs = analyzer.feed({ mag, rms: level, t });
    evs.forEach(e => onEvent(e, t));
  }
}

const NOISE = 0.002, FLOOR = NOISE * 3;
const newAnalyzer = () => D.createStrumAnalyzer({ sampleRate: SR, fftSize: N, noiseFloor: FLOOR });

// One isolated strum clip -> strum events
function strumClip(chord, opts) {
  const buf = new Float32Array(Math.round(SR * 0.9));
  addNoise(buf, NOISE); addHum(buf, 0.0007);
  addStrum(buf, chord, Math.round(SR * 0.4), Object.assign({ maxLen: SR * 0.5 }, opts));
  const an = newAnalyzer(), out = [];
  analyse(buf, an, e => { if (e.type === "strum") out.push(e); });
  return out;
}

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };

// ---------- (a) calibrate then classify ----------
console.log(`Constants: K=${C.SENSITIVITY_K} FLUX_MIN=${C.FLUX_MIN} REFRACTORY=${C.REFRACTORY_MS}ms chroma ${C.CHROMA_DELAY_MS}+${C.CHROMA_SPAN_MS}ms MIN_SIM=${C.MIN_SIM} MIN_MARGIN=${C.MIN_MARGIN}`);
console.log("\n(a) calibrate (3 strums) then classify 40 strums per chord");
const TRIALS = 40;
let tonMin = 1;
for (const pair of [["A", "D"], ["C", "G"], ["Am", "Em"], ["E", "Em"]]) {
  const templates = {};
  for (const ch of pair) {
    const vs = [];
    while (vs.length < 3) { const ev = strumClip(ch, { vel: uni(0.6, 0.9) }); if (ev.length) vs.push(ev[0].chroma); }
    templates[ch] = D.averageVectors(vs);
  }
  const tsim = D.cosine(templates[pair[0]], templates[pair[1]]);
  let right = 0, wrong = 0, unclear = 0, missed = 0, extra = 0;
  for (const ch of pair) for (let i = 0; i < TRIALS; i++) {
    const ev = strumClip(ch, { dropString: true });
    if (!ev.length) { missed++; continue; }
    if (ev.length > 1) extra += ev.length - 1;
    const r = D.classify(ev[0].chroma, templates);
    tonMin = Math.min(tonMin, D.tonality(ev[0].chroma));
    if (r.chord === ch) right++; else if (r.chord) wrong++; else unclear++;
  }
  const acc = right / (TRIALS * 2);
  console.log(`  ${pair.join("–")}: template similarity ${tsim.toFixed(3)} · correct ${right}/${TRIALS * 2} (${(acc * 100).toFixed(1)}%) · wrong ${wrong} · unclear ${unclear} · missed onsets ${missed} · extra onsets ${extra}`);
  check(acc >= 0.95 && wrong <= 0.02 * TRIALS * 2 && extra === 0, `${pair.join("–")} accuracy >= 95%, wrong labels <= 2%, no double onsets`);
}

// ---------- (b) simulated one-minute-changes run ----------
console.log(`  lowest chord tonality seen: ${tonMin.toFixed(2)}`);
console.log("\n(b) simulated 60 s A/D run (2.5 s apart, jitter, gaps, one noise burst)");
setSeed(+(process.env.SEED_B || 42));
{
  const templates = {};
  for (const ch of ["A", "D"]) {
    const vs = [];
    while (vs.length < 3) { const ev = strumClip(ch, { vel: uni(0.6, 0.9) }); if (ev.length) vs.push(ev[0].chroma); }
    templates[ch] = D.averageVectors(vs);
  }
  const buf = new Float32Array(SR * 60);
  addNoise(buf, NOISE); addHum(buf, 0.0007);
  const gaps = new Set([7, 8, 15]); // skipped strums -> silent gaps
  const played = [];
  let idx = 0;
  const times = [];
  for (let t = 1.0; t < 58.5; t += 2.5, idx++) {
    if (gaps.has(idx)) continue;
    const ch = idx % 2 ? "D" : "A";
    const at = t + uni(-0.15, 0.15);
    times.push(at); played.push(ch);
  }
  times.forEach((at, i) => {
    const s0 = Math.round(at * SR);
    const next = times[i + 1];
    // 60% of the time the old chord is damped as the fingers lift; otherwise it rings into the next strum
    const beforeGap = next && next - at > 3;
    const muteAt = next && (beforeGap || uni(0, 1) < 0.6) ? Math.round(Math.min(next - 0.2, at + 2.3) * SR) : Infinity;
    addStrum(buf, played[i], s0, { muteAt, dropString: true, maxLen: SR * 4 });
  });
  const BURST_S = 20.0; // inside the silent gap left by skipped strums 7 and 8 (someone bumps the mic)
  const burstAt = Math.round(SR * BURST_S);
  addNoise(buf, 0.05, burstAt, burstAt + Math.round(SR * 0.25));
  let expected = 0;
  for (let i = 1; i < played.length; i++) if (played[i] !== played[i - 1]) expected++;
  const counter = D.createChangeCounter();
  const an = newAnalyzer();
  let burstLabel = "no onset";
  analyse(buf, an, e => {
    if (e.type !== "strum") return;
    const r = D.classify(e.chroma, templates);
    if (Math.abs(e.t - BURST_S * 1000) < 300) burstLabel = r.chord || `unclear (best ${r.best} ${r.sim.toFixed(2)}, tonality ${r.tonality.toFixed(2)})`;
    counter.push(r.chord);
  });
  const s = counter.state;
  console.log(`  played ${played.length} strums, expected ${expected} changes · counted ${s.changes} · clean ${s.clean} · unclear ${s.unclear} · noise burst → ${burstLabel}`);
  check(Math.abs(s.changes - expected) <= 1, `change count ${s.changes} within ±1 of ${expected}`);
  check(burstLabel.startsWith("unclear") || burstLabel === "no onset", `noise burst not labelled as a chord`);
}

// ---------- (c) no onsets on steady sustain ----------
console.log("\n(c) onset detector on one strum + 6 s of sustain");
for (const [label, trem] of [["plain sustain", 0], ["sustain with 5 Hz 15% tremolo", 0.15]]) {
  setSeed(7);
  const buf = new Float32Array(SR * 7);
  addNoise(buf, NOISE); addHum(buf, 0.0007);
  addStrum(buf, "G", Math.round(SR * 0.5), { vel: 0.9, maxLen: SR * 7 });
  if (trem) for (let n = 0; n < buf.length; n++) buf[n] *= 1 + trem * Math.sin(2 * Math.PI * 5 * n / SR);
  const an = newAnalyzer();
  const onsets = [];
  analyse(buf, an, e => { if (e.type === "onset") onsets.push(Math.round(e.t)); });
  console.log(`  ${label}: onsets at ${onsets.join(", ")} ms`);
  check(onsets.length === 1, `${label}: exactly one onset`);
}
// silence + noise only
{
  setSeed(9);
  const buf = new Float32Array(SR * 5);
  addNoise(buf, NOISE); addHum(buf, 0.0007);
  const an = newAnalyzer(); let n = 0;
  analyse(buf, an, e => { if (e.type === "onset") n++; });
  check(n === 0, `5 s of room noise: ${n} onsets`);
}

// Other suites share this runner so `node test/dsp.test.mjs` runs everything.
for (const f of ["timing", "check", "pitch", "data"]) { const m = await import(`./${f}.test.mjs`); await m.run(check); }

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
