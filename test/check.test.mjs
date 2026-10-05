// Chord check: strums scored against the IDEAL chroma built from the shape (no calibration).
// The synth's partial weights (brightness h^-0.7..h^-1.4, random per partial) differ from the ideal's h^-0.5
// assumption on purpose, so a good score is not circular.
import { createRequire } from "node:module";
import { SR, setSeed, addStrum, addNoise, addHum } from "./synth.mjs";
const require = createRequire(import.meta.url);
const D = require("../dsp.js"), CH = require("../chords.js");
const N = D.C.FFT_SIZE, HOP = Math.round(SR * D.C.HOP_MS / 1000), WIN = D.blackman(N);

function strumChroma(chord, opts) {
  const buf = new Float32Array(Math.round(SR * 0.9));
  addNoise(buf, 0.002); addHum(buf, 0.0007);
  addStrum(buf, chord, Math.round(SR * 0.4), Object.assign({ maxLen: SR * 0.5 }, opts));
  const an = D.createStrumAnalyzer({ sampleRate: SR, fftSize: N, noiseFloor: 0.006 });
  let out = null;
  for (let end = HOP; end <= buf.length; end += HOP) {
    const evs = an.feed({ mag: D.magnitudeSpectrum(buf, end, WIN), rms: D.rms(buf.subarray(end - 1024, end)), t: end / SR * 1000 });
    evs.forEach(e => { if (e.type === "strum" && !out) out = e.chroma; });
  }
  return out;
}
// Mute string i by giving the synth a shape with that string removed.
function withMuted(chord, i) { const k = chord + "_mute" + i; CH.CHORDS[k] = CH.CHORDS[chord].map((f, j) => j === i ? -1 : f); return k; }

export function run(check) {
  console.log(`\n(check) chord check vs ideal chroma: good >= ${D.C.CHECK_GOOD}, weak < ${D.C.WEAK_RATIO} x ideal`);
  setSeed(500);
  const names = Object.keys(CH.CHORDS).filter(k => !k.includes("_"));
  let worst = 1, falseFlags = 0, total = 0;
  const rows = [];
  for (const c of names) {
    const scores = [];
    for (let i = 0; i < 10; i++) {
      const ch = strumChroma(c); if (!ch) continue;
      const r = D.chordCheck(ch, CH.CHORDS[c]);
      scores.push(r.score); total++; if (r.weak.length || r.extra.length) falseFlags++;
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length, min = Math.min(...scores);
    worst = Math.min(worst, min); rows.push(`${c} ${mean.toFixed(2)}/${min.toFixed(2)}`);
  }
  console.log(`  full strums, mean/min score per chord: ${rows.join(" · ")}`);
  console.log(`  full strums with a (false) weak/extra flag: ${falseFlags}/${total}`);
  check(worst >= D.C.CHECK_GOOD - 0.05, `every full strum scores >= ${(D.C.CHECK_GOOD - 0.05).toFixed(2)} (worst ${worst.toFixed(2)})`);
  check(falseFlags / total <= 0.1, `false weak/extra flags on full strums <= 10% (${falseFlags}/${total})`);

  // A muted string whose pitch class is unique in the shape should be named (a doubled one never pinned)
  // "Masked": the muted string's pitch class is also a harmonic (2..6) of another sounding string, e.g. C's G is
  // the 3rd harmonic of C and D's F♯ the 5th harmonic of D. A strum can't reliably reveal those: known limitation.
  const isMasked = (c, s) => { const sh = CH.CHORDS[c], pc = (CH.OPEN_MIDI[s] + sh[s]) % 12;
    return sh.some((f, j) => j !== s && f >= 0 && [2, 3, 4, 5, 6].some(h => Math.round(CH.OPEN_MIDI[j] + f + 12 * Math.log2(h)) % 12 === pc)); };
  for (const [c, s] of [["D", 5], ["C", 3], ["Am", 4], ["G", 4], ["E", 3]]) {
    let named = 0, scoreFull = 0, scoreMuted = 0;
    const k = withMuted(c, s);
    for (let i = 0; i < 10; i++) {
      const ch = strumChroma(k), r = D.chordCheck(ch, CH.CHORDS[c]);
      scoreMuted += r.score / 10;
      if (r.weak.some(w => w.string === s)) named++;
      scoreFull += D.chordCheck(strumChroma(c), CH.CHORDS[c]).score / 10;
    }
    delete CH.CHORDS[k];
    const uniq = CH.CHORDS[c].filter((f, j) => f >= 0 && (CH.OPEN_MIDI[j] + f) % 12 === (CH.OPEN_MIDI[s] + CH.CHORDS[c][s]) % 12).length === 1;
    console.log(`  ${c} with the ${CH.STRING_NAMES[s]} string muted (${uniq ? "unique" : "doubled"} pitch class): named ${named}/10 · score ${scoreMuted.toFixed(2)} vs full ${scoreFull.toFixed(2)}`);
    if (!uniq) check(named === 0, `${c}: doubled note never pinned on one string`);
    else if (isMasked(c, s)) console.log(`INFO   ${c}: the ${CH.STRING_NAMES[s]} string's note is also a harmonic of other strings, so a strum can't reliably show it missing (named ${named}/10) — use string-by-string mode`);
    else check(named >= 8, `${c}: muted ${CH.STRING_NAMES[s]} string named in >= 8/10`);
  }
  // Wrong chord scores lower than the right one
  {
    let wrong = 0, right = 0;
    for (let i = 0; i < 10; i++) { wrong += D.chordCheck(strumChroma("Am"), CH.CHORDS.C).score / 10; right += D.chordCheck(strumChroma("C"), CH.CHORDS.C).score / 10; }
    console.log(`  playing Am when C is asked: score ${wrong.toFixed(2)} vs C ${right.toFixed(2)}`);
    check(wrong < D.C.CHECK_GOOD && right - wrong > 0.05, "a wrong chord scores below 'clean' and below the right chord");
  }
}
