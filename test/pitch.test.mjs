// YIN pitch + note tracker on synthetic plucked strings, including a weak fundamental on low E.
import { createRequire } from "node:module";
import { SR, setSeed, uni, addPluck, addNoise } from "./synth.mjs";
const require = createRequire(import.meta.url);
const D = require("../dsp.js");
const FR = 2048, HOP = Math.round(SR * 0.02);

export function run(check) {
  console.log(`\n(pitch) YIN: threshold ${D.C.YIN_THRESHOLD}, ${FR}-sample frames, ±${D.C.PITCH_TOL_CENTS} cents`);
  setSeed(600);
  for (const [label, fg] of [["full fundamental", 1], ["weak fundamental (-20 dB)", 0.1]]) {
    let exact = 0, octave = 0, wrong = 0, n = 0, maxErr = 0;
    for (let midi = 40; midi <= 76; midi++) for (const cents of [-20, 0, 20]) {
      const buf = new Float32Array(SR * 0.5); addNoise(buf, 0.002);
      addPluck(buf, midi, 0, { cents, fundamentalGain: fg, amp: uni(0.08, 0.2) });
      const r = D.yin(buf.subarray(Math.round(SR * 0.15), Math.round(SR * 0.15) + FR), SR);
      n++;
      const m = r ? D.hzToMidi(r.hz) : -99, kind = D.noteMatches(m, midi + cents / 100, 10);
      if (kind === "exact") { exact++; maxErr = Math.max(maxErr, Math.abs(m - midi - cents / 100) * 100); } else if (kind === "octave") octave++; else wrong++;
    }
    console.log(`  ${label}: E2..E5 x 3 detunings (${n} tones): exact ${exact}, octave slips ${octave}, wrong ${wrong}, max error ${maxErr.toFixed(1)} cents`);
    if (fg === 1) check(exact === n, `${label}: every tone within 10 cents`);
    else check(wrong === 0, `${label}: no wrong notes (octave slips are tolerated by noteMatches)`);
  }
  // low E specifically
  {
    const buf = new Float32Array(SR * 0.5); addNoise(buf, 0.002); addPluck(buf, 40, 0, { fundamentalGain: 0.05 });
    const r = D.yin(buf.subarray(SR * 0.2, SR * 0.2 + FR), SR);
    console.log(`  low E 82.41 Hz, fundamental -26 dB: ${r.hz.toFixed(2)} Hz`);
    check(D.noteMatches(D.hzToMidi(r.hz), 40) != null, "low E with a very weak fundamental is accepted as E2 (or its octave)");
  }
  // note tracker on a short line with a repeated note re-plucked
  {
    const seq = [45, 45, 48, 50, 50, 52, 50, 48, 45], gap = 0.35;
    const buf = new Float32Array(Math.round(SR * (seq.length * gap + 0.6))); addNoise(buf, 0.002);
    seq.forEach((m, i) => addPluck(buf, m, Math.round((0.2 + i * gap) * SR), { amp: uni(0.1, 0.2), muteAt: Math.round((0.2 + (i + 1) * gap - 0.01) * SR) }));
    const tr = D.createNoteTracker({ minRms: 0.006 }), got = []; let maxCents = 0;
    for (let end = FR; end <= buf.length; end += HOP) {
      const fr = buf.subarray(end - FR, end), r = D.yin(fr, SR);
      const ev = tr.feed({ hz: r && r.hz, aperiodicity: r ? r.aperiodicity : 1, rms: D.rms(fr.subarray(FR - 1024)), t: end / SR });
      if (ev) { got.push(ev.midi); maxCents = Math.max(maxCents, Math.abs(D.hzToMidi(ev.hz) - ev.midi) * 100); }
    }
    console.log(`  note tracker: played ${seq.map(D.midiName).join(" ")} → heard ${got.map(D.midiName).join(" ")}`);
    check(got.join() === seq.join(), "note tracker reports each note once, including re-plucked repeats");
    check(maxCents <= 10, `note tracker's reported frequency agrees with its note (max ${maxCents.toFixed(1)} cents off)`);
  }
}
