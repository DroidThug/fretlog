// Calibration gate + "clean only" counting. A calibration strum is accepted only if it scores >= CAL_MIN
// against the shape's ideal chroma AND no chord tone is quiet (D.strumQuality).
import { createRequire } from "node:module";
import { SR, setSeed, uni, addStrum, addNoise, addHum } from "./synth.mjs";
const require = createRequire(import.meta.url);
const D = require("../dsp.js"), CH = require("../chords.js");
const N = D.C.FFT_SIZE, HOP = Math.round(SR * D.C.HOP_MS / 1000), WIN = D.blackman(N);

function strumChroma(key, opts) {
  const buf = new Float32Array(Math.round(SR * 0.9)); addNoise(buf, 0.002); addHum(buf, 0.0007);
  addStrum(buf, key, Math.round(SR * 0.4), Object.assign({ maxLen: SR * 0.5 }, opts));
  const an = D.createStrumAnalyzer({ sampleRate: SR, fftSize: N, noiseFloor: 0.006 }); let out = null;
  for (let end = HOP; end <= buf.length; end += HOP)
    an.feed({ mag: D.magnitudeSpectrum(buf, end, WIN), rms: D.rms(buf.subarray(end - 1024, end)), t: end / SR * 1000 }).forEach(e => { if (e.type === "strum" && !out) out = e.chroma; });
  return out;
}
const mutedKey = (c, strings) => { const k = c + "_m" + strings.join(""); CH.CHORDS[k] = CH.CHORDS[c].map((f, j) => strings.includes(j) ? -1 : f); return k; };

export function run(check) {
  console.log(`\n(calib) calibration gate: score >= ${D.C.CAL_MIN} and no quiet chord tone; run "clean" >= ${D.C.RUN_CLEAN_MIN}`);
  setSeed(800);
  const names = Object.keys(CH.CHORDS).filter(k => !k.includes("_"));
  let acc = 0, n = 0, minScore = 1; const rej = [];
  for (const c of names) for (let i = 0; i < 10; i++) {
    const q = D.strumQuality(strumChroma(c), CH.CHORDS[c]); n++; minScore = Math.min(minScore, q.score);
    if (q.ok) acc++; else rej.push(`${c} ${q.score.toFixed(2)} ${q.reason.type}`);
  }
  console.log(`  clean strums of all ${names.length} chords: accepted ${acc}/${n}, lowest score ${minScore.toFixed(3)}${rej.length ? " · rejected: " + rej.join(", ") : ""}`);
  check(acc === n, "every clean synthetic strum of every chord passes the calibration gate");

  // single muted strings: unique, unmasked pitch classes must be caught
  const T = 10, rows = [];
  for (const [c, s, expect] of [["Am", 4, true], ["Em", 3, true], ["Dm", 5, true], ["Bm", 4, true], ["Fmaj7", 5, true], ["D", 5, null], ["C", 1, null], ["C", 3, null], ["E", 3, null], ["G", 4, null]]) {
    const k = mutedKey(c, [s]); let r = 0, named = 0;
    for (let i = 0; i < T; i++) { const q = D.strumQuality(strumChroma(k), CH.CHORDS[c]); if (!q.ok) r++; if (q.reason && q.reason.type === "string" && q.reason.string === s) named++; }
    delete CH.CHORDS[k];
    rows.push(`${c} without ${CH.STRING_NAMES[s]}: rejected ${r}/${T}, string named ${named}/${T}`);
    if (expect) check(r >= 8, `${c} with muted ${CH.STRING_NAMES[s]} (unique, not an overtone of another string) rejected >= 8/10 (${r})`);
  }
  rows.forEach(x => console.log("  " + x));
  console.log("INFO   D's high e (F♯ = 5th harmonic of D), C's G (3rd harmonic of C), E's G (G♯ = 5th harmonic of E) and doubled notes (C's A string, G's B string) are filled in by other strings: a strum can't reliably prove them missing. Chord check's string-by-string mode can.");
  // two muted strings (a common beginner problem)
  for (const [c, ss] of [["C", [1, 5]], ["G", [4, 5]], ["A", [3, 4]], ["D", [4, 5]]]) {
    const k = mutedKey(c, ss); let r = 0;
    for (let i = 0; i < T; i++) if (!D.strumQuality(strumChroma(k), CH.CHORDS[c]).ok) r++;
    delete CH.CHORDS[k];
    console.log(`  ${c} without ${ss.map(s => CH.STRING_NAMES[s]).join(" + ")}: rejected ${r}/${T}`);
  }
  // wrong chord at calibration
  { let r = 0; for (let i = 0; i < T; i++) if (!D.strumQuality(strumChroma("Am"), CH.CHORDS.C).ok) r++; check(r === T, `Am strummed while calibrating C is rejected ${r}/${T}`); }

  // clean-only run: Em–Am, half of the Am strums have the B string muted (detectable) -> sloppy
  setSeed(820);
  const tpl = {};
  for (const c of ["Em", "Am"]) { const vs = []; while (vs.length < 3) { const ch = strumChroma(c, { vel: uni(0.6, 0.9) }); if (ch && D.strumQuality(ch, CH.CHORDS[c]).ok) vs.push(ch); } tpl[c] = D.averageVectors(vs); }
  const amMuted = mutedKey("Am", [4]);
  const seq = [], played = [];
  for (let i = 0; i < 24; i++) { const c = i % 2 ? "Am" : "Em", sloppy = c === "Am" && i % 4 === 1; seq.push({ c, sloppy }); }
  let expClean = 0, expSloppy = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i].c !== seq[i - 1].c) { if (seq[i].sloppy) expSloppy++; else expClean++; }
  const clean = D.createChangeCounter(), all = D.createChangeCounter({ countSloppy: true });
  for (const st of seq) {
    const ch = strumChroma(st.sloppy ? amMuted : st.c);
    const r = D.classify(ch, tpl), q = r.chord ? D.strumQuality(ch, CH.CHORDS[r.chord], D.C.RUN_CLEAN_MIN) : null;
    clean.push(r.chord, q ? q.ok : true); all.push(r.chord, q ? q.ok : true); played.push(r.chord);
  }
  delete CH.CHORDS[amMuted];
  const s = clean.state;
  console.log(`  clean-only run Em–Am, 23 switches (${expSloppy} onto a B-muted Am): clean changes ${s.changes} (expected ${expClean}) · sloppy changes ${s.sloppyChanges} (expected ${expSloppy}) · unclear ${s.unclear} · all-changes mode ${all.state.changes}`);
  check(Math.abs(s.changes - expClean) <= 1 && Math.abs(s.sloppyChanges - expSloppy) <= 1, "clean-only counting excludes sloppy strums (±1)");
  check(Math.abs(all.state.changes - 23) <= 1, "all-changes mode still counts every switch (±1)");
}
