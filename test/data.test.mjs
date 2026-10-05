// Content checks: exercises reference real lessons and chords, ids are unique and hash-safe.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const EX = require("../exercises.js"), L = require("../lessons.js"), CH = require("../chords.js");

export function run(check) {
  console.log("\n(data) exercises.js / lessons.js / chords.js");
  const ids = EX.EXERCISES.map(e => e.id);
  check(new Set(ids).size === ids.length, `${ids.length} exercise ids are unique`);
  check(ids.every(id => /^[a-z0-9-]+$/.test(id) && !/^[A-G]/.test(id)), "ids are lowercase, hash-safe and can't parse as a chord pair");
  const badSlugs = EX.EXERCISES.flatMap(e => e.justinLessons.filter(s => !L.BY_SLUG[s]).map(s => `${e.id}:${s}`));
  check(!badSlugs.length, `every justinLessons slug exists in lessons.js ${badSlugs.join(" ")}`);
  check(EX.EXERCISES.filter(e => e.grade > 1).every(e => e.justinLessons.length === 0), "Grade 2/3 exercises link no (unverified) lessons");
  check(EX.EXERCISES.every(e => EX.ENGINES[e.engine] && [1, 2, 3].includes(e.grade)), "every exercise has a known engine and grade 1-3");
  const chordsUsed = EX.EXERCISES.flatMap(e => (e.params.pairs || []).flatMap(p => p.split("–")).concat(e.params.chords || []));
  const missing = chordsUsed.filter(c => !CH.CHORDS[c]);
  check(!missing.length, `every chord used has a shape ${missing.join(" ")}`);
  check(Object.keys(CH.CHORDS).every(k => /^[A-Za-z0-9#]+$/.test(k)), "chord keys have no spaces, dashes or parentheses");
  check(L.ALL.every(l => !l.yt || /^[A-Za-z0-9_-]{11}$/.test(l.yt)), `${L.ALL.length} Grade 1 lessons, video ids well-formed`);
  check(L.GRADES[2].modules === null && L.GRADES[3].modules === null, "Grade 2/3 lesson data is not invented");
}
