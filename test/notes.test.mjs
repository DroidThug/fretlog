// Note finder items + adaptive picking, and the riff/scale follower fed by synthetic plucks through YIN.
import { createRequire } from "node:module";
import { SR, setSeed, uni, random, addPluck, addNoise } from "./synth.mjs";
const require = createRequire(import.meta.url);
const D = require("../dsp.js"), EX = require("../exercises.js");
const FR = 2048, HOP = Math.round(SR * 0.02);

function playAndFollow(midis, gap) {
  const buf = new Float32Array(Math.round(SR * (midis.length * gap + 0.8))); addNoise(buf, 0.002);
  midis.forEach((m, i) => addPluck(buf, m, Math.round((0.3 + i * gap) * SR), { amp: uni(0.08, 0.2), fundamentalGain: m < 48 ? 0.3 : 1, muteAt: Math.round((0.3 + (i + 1) * gap - 0.01) * SR) }));
  const tr = D.createNoteTracker({ minRms: 0.006 }), heard = [];
  for (let end = FR; end <= buf.length; end += HOP) {
    const fr = buf.subarray(end - FR, end), r = D.yin(fr, SR);
    const ev = tr.feed({ hz: r && r.hz, aperiodicity: r ? r.aperiodicity : 1, rms: D.rms(fr.subarray(FR - 1024)), t: end / SR });
    if (ev) heard.push(D.hzToMidi(ev.hz));
  }
  return heard;
}

export function run(check) {
  console.log("\n(notes) note finder + riff/scale follow");
  const byId = id => EX.byId(id).params;
  const g1 = D.noteItems(byId("g1-notes")), g2 = D.noteItems(byId("g2-notes")), g3 = D.noteItems(byId("g3-notes"));
  console.log(`  items: G1 ${g1.length} open strings · G2 ${g2.length} naturals on 6 & 5 · G3 ${g3.length} notes on 6, 5 & 4`);
  check(g1.length === 6 && g2.length === 16 && g3.length === 39, "item counts: 6 open strings, 2 x 8 naturals (frets 0-12), 3 x 13 chromatic");
  check(g2.every(i => D.SHARP_NAMES[i.midi % 12].length === 1) && g1.map(i => i.midi).join() === "40,45,50,55,59,64", "G2 items are all naturals; G1 open-string pitches are E2 A2 D3 G3 B3 E4");
  // adaptive: an item missed half the time should come up clearly more often than one always right
  setSeed(700);
  const stats = {}; g1.forEach(i => (stats[i.key] = { seen: 10, miss: 0, ms: 15000 }));
  stats.o4 = { seen: 10, miss: 5, ms: 40000 };
  const counts = {}; let last = null;
  for (let k = 0; k < 6000; k++) { const it = D.pickNext(g1, stats, random, last); counts[it.key] = (counts[it.key] || 0) + 1; last = it.key; }
  const others = (6000 - counts.o4) / 5;
  console.log(`  adaptive picking over 6000 draws: missed/slow D string ${counts.o4}, others ~${Math.round(others)} each`);
  check(counts.o4 > 2 * others, "a missed, slow note is picked more than twice as often as a solid one");

  // follower on synthetic plucks: A minor pentatonic pattern 1 up and down
  setSeed(710);
  const seq = byId("g2-follow").sequences[0].tab.map(([s, f]) => D.tabMidi(s, f));
  const heard = playAndFollow(seq, 0.32);
  const fol = D.createFollower(seq); let done = false;
  heard.forEach(m => { const r = fol.push(m); if (r.done) done = true; });
  console.log(`  pentatonic pattern 1 (${seq.length} notes) played cleanly: heard ${heard.length} notes, done ${done}, mistakes ${fol.mistakes}`);
  check(done && fol.mistakes === 0, "clean run of the pentatonic pattern completes with 0 mistakes");
  // one wrong note in the middle
  setSeed(711);
  const slip = seq.slice(); slip.splice(6, 0, seq[6] + 1);
  const fol2 = D.createFollower(seq); let done2 = false;
  playAndFollow(slip, 0.32).forEach(m => { if (fol2.push(m).done) done2 = true; });
  console.log(`  same pattern with one wrong fret inserted: done ${done2}, mistakes ${fol2.mistakes}`);
  check(done2 && fol2.mistakes === 1, "a slipped note counts 1 mistake and the run still completes");
  // G1 low-string drill incl. low E with weak fundamental
  setSeed(712);
  const g1seq = byId("g1-follow").sequences[0].tab.map(([s, f]) => D.tabMidi(s, f));
  const fol3 = D.createFollower(g1seq); let done3 = false;
  playAndFollow(g1seq, 0.4).forEach(m => { if (fol3.push(m).done) done3 = true; });
  console.log(`  G1 strings 6 & 5 drill (${g1seq.map(D.midiName).join(" ")}): done ${done3}, mistakes ${fol3.mistakes}`);
  check(done3 && fol3.mistakes === 0, "low-string drill (weak low fundamentals) completes cleanly");
}
