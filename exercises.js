/* Practice exercises, grade by grade. One array drives the Practice hub and every engine page.
   {id, grade, engine, title, blurb, justinLessons:[slugs], params}
   Grade 2/3 justinLessons stay empty until their lesson data is verified.
   Riff/scale content is original drills and scale patterns only — no song transcriptions. */
(function (root) {
  "use strict";
  // Engine → page. `ready:false` engines are hidden from the hub until they ship.
  const ENGINES = {
    changes: { page: "changes.html", name: "Chord changes", ready: true },
    timing: { page: "timing.html", name: "Strum timing", ready: false },
    check: { page: "check.html", name: "Chord check", ready: false },
    notes: { page: "notes.html", name: "Note finder", ready: false },
    follow: { page: "follow.html", name: "Riff & scale follow", ready: false },
  };

  const G1_PAIRS = ["A–D", "D–E", "A–E", "E–Em", "A–Am", "Am–Em", "D–Dm", "Am–Dm", "C–Am", "C–G", "G–D", "G–Em", "C–D", "G–C", "Em–C"];
  // Tab notes are [string, fret] with string 1 = high e, 6 = low E.
  const up = a => a, upDown = a => a.concat(a.slice(0, -1).reverse());

  const EXERCISES = [
    // ---------------- Grade 1 ----------------
    { id: "g1-changes", grade: 1, engine: "changes", title: "One-minute changes",
      blurb: "Swap between two chords for a minute; the mic counts the changes.",
      justinLessons: ["one-minute-changes-exercise-b1-110", "how-to-use-anchor-fingers-b1-109", "chord-changes-for-one-b1-206", "forcing-chord-changes-b1-606", "best-chord-changes-to-work-on-b1-702"],
      params: { pairs: G1_PAIRS, duration: 60 } },
    { id: "g1-strum-beat", grade: 1, engine: "timing", title: "Downstrums on the beat",
      blurb: "One down strum per click. Tells you if you rush or drag.",
      justinLessons: ["strumming-on-the-beat-b1-205", "tapping-your-foot-b1-203", "strumming-mechanics-b1-204"],
      params: { bpm: [50, 110, 70], beatsPerBar: 4, hits: [0, 1, 2, 3], strokes: "DDDD", bars: 8 } },
    { id: "g1-strum-one", grade: 1, engine: "timing", title: "Strumming on 1",
      blurb: "One strum at the start of each bar, then change chord in the gap.",
      justinLessons: ["bars-strumming-on-1-b1-111"],
      params: { bpm: [50, 110, 70], beatsPerBar: 4, hits: [0], strokes: "D", bars: 8 } },
    { id: "g1-strum-pattern", grade: 1, engine: "timing", title: "THE strumming pattern",
      blurb: "D · D U · U D U. Only the strums in the pattern are checked.",
      justinLessons: ["the-strumming-pattern-b1-404", "meet-the-metronome-b1-403", "strumming-patterns-with-ups-b1-307", "all-about-up-strums-b1-306"],
      params: { bpm: [50, 100, 60], beatsPerBar: 4, hits: [0, 1, 1.5, 2.5, 3, 3.5], strokes: "DDUUDU", bars: 8 } },
    { id: "g1-check", grade: 1, engine: "check", title: "Chord check",
      blurb: "Strum a chord and see whether every note rings, or pluck string by string.",
      justinLessons: ["how-to-play-the-d-chord-b1-105", "how-to-play-the-a-chord-b1-108", "how-to-play-the-e-chord-b1-201", "the-e-minor-chord-b1-302", "the-a-minor-chord-b1-303", "the-d-minor-chord-b1-402", "the-c-chord-b1-501", "the-g-chord-hacked-b1-602", "positive-finger-placement-b1-103", "how-to-strum-the-correct-strings-b1-112", "the-8-essential-beginner-chord-grips-b1-701"],
      params: { chords: ["A", "D", "E", "Am", "Em", "Dm", "C", "G"] } },
    { id: "g1-notes", grade: 1, engine: "notes", title: "Open string names",
      blurb: "A string name appears; play that open string.",
      justinLessons: ["open-string-note-names-b1-605", "understanding-music-notes-b1-504"],
      params: { mode: "open", rounds: 12 } },
    { id: "g1-follow", grade: 1, engine: "follow", title: "First-frets note drill",
      blurb: "Pick through short tab drills on the two lowest strings.",
      justinLessons: ["how-to-read-guitar-tab-b1-405", "beginner-alternate-picking-b1-601"],
      params: { sequences: [
        { name: "Strings 6 & 5 · open to 3rd fret", tab: upDown([[6, 0], [6, 1], [6, 3], [5, 0], [5, 2], [5, 3]]) },
        { name: "Spider · frets 1-2-3 on 6 & 5", tab: up([[6, 1], [6, 2], [6, 3], [5, 1], [5, 2], [5, 3], [5, 3], [5, 2], [5, 1], [6, 3], [6, 2], [6, 1]]) },
      ] } },

    // ---------------- Grade 2 ----------------
    { id: "g2-changes", grade: 2, engine: "changes", title: "One-minute changes · Grade 2 grips",
      blurb: "Fmaj7, Cadd9 and the rock G against the open chords.",
      justinLessons: [], params: { pairs: ["C–Fmaj7", "Am–Fmaj7", "rockG–Cadd9", "D–Fmaj7", "Em–Cadd9"], duration: 60 } },
    { id: "g2-strum-8ths", grade: 2, engine: "timing", title: "Eighth-note down-ups",
      blurb: "Down on the beat, up on the “and”, all bar long.",
      justinLessons: [], params: { bpm: [50, 110, 65], beatsPerBar: 4, hits: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5], strokes: "DUDUDUDU", bars: 8 } },
    { id: "g2-strum-68", grade: 2, engine: "timing", title: "6/8 pattern",
      blurb: "Six clicks a bar, accents on 1 and 4: strum D · U D · U.",
      justinLessons: [], params: { bpm: [80, 160, 110], beatsPerBar: 6, accents: [0, 3], hits: [0, 2, 3, 5], strokes: "DUDU", bars: 8, unit: "eighth-note clicks" } },
    { id: "g2-check", grade: 2, engine: "check", title: "Chord check · Grade 2",
      blurb: "Fmaj7, Cadd9, rock G and the E5 / A5 power chords.",
      justinLessons: [], params: { chords: ["Fmaj7", "Cadd9", "rockG", "E5", "A5"] } },
    { id: "g2-notes", grade: 2, engine: "notes", title: "Notes on strings 6 & 5",
      blurb: "Find natural notes up to the 12th fret on the two bass strings.",
      justinLessons: [], params: { mode: "fretted", strings: [6, 5], maxFret: 12, accidentals: false, rounds: 15 } },
    { id: "g2-follow", grade: 2, engine: "follow", title: "Minor pentatonic · pattern 1",
      blurb: "A minor pentatonic at the 5th fret, up and back down.",
      justinLessons: [], params: { sequences: [
        { name: "A minor pentatonic · pattern 1", tab: upDown([[6, 5], [6, 8], [5, 5], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7], [2, 5], [2, 8], [1, 5], [1, 8]]) },
      ] } },

    // ---------------- Grade 3 ----------------
    { id: "g3-changes", grade: 3, engine: "changes", title: "One-minute changes · barre chords",
      blurb: "F and Bm against open chords. Barre chords are harder to hear apart.",
      justinLessons: [], params: { pairs: ["F–C", "F–G", "Bm–G", "Bm–D", "F–Am"], duration: 60, barreNote: true } },
    { id: "g3-strum-16ths", grade: 3, engine: "timing", title: "Sixteenth-note pattern",
      blurb: "“1 · & a” on every beat: D · D U.",
      justinLessons: [], params: { bpm: [50, 90, 60], beatsPerBar: 4, hits: [0, .5, .75, 1, 1.5, 1.75, 2, 2.5, 2.75, 3, 3.5, 3.75], strokes: "DDUDDUDDUDDU", bars: 8 } },
    { id: "g3-shuffle", grade: 3, engine: "timing", title: "Shuffle feel",
      blurb: "Swung eighths: the up strum lands late, on the last third of the beat.",
      justinLessons: [], params: { bpm: [50, 110, 70], beatsPerBar: 4, hits: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5], strokes: "DUDUDUDU", bars: 8, swing: true } },
    { id: "g3-check", grade: 3, engine: "check", title: "Chord check · barre chords",
      blurb: "F, Bm, B7 and the E-minor and A-shape barres.",
      justinLessons: [], params: { chords: ["F", "Bm", "B7", "F#m", "Bb"] } },
    { id: "g3-notes", grade: 3, engine: "notes", title: "Notes on strings 6, 5 & 4",
      blurb: "Every note including sharps and flats, up to the 12th fret.",
      justinLessons: [], params: { mode: "fretted", strings: [6, 5, 4], maxFret: 12, accidentals: true, rounds: 20 } },
    { id: "g3-follow", grade: 3, engine: "follow", title: "Pentatonic patterns 1 & 2 · blues run",
      blurb: "Link the first two pentatonic shapes, then add the blue note.",
      justinLessons: [], params: { sequences: [
        { name: "A minor pentatonic · pattern 2", tab: upDown([[6, 8], [6, 10], [5, 7], [5, 10], [4, 7], [4, 10], [3, 7], [3, 9], [2, 8], [2, 10], [1, 8], [1, 10]]) },
        { name: "Patterns 1 → 2 on the top strings", tab: up([[3, 5], [3, 7], [2, 5], [2, 8], [1, 5], [1, 8], [1, 10], [2, 10], [2, 8], [3, 9], [3, 7]]) },
        { name: "A blues scale · pattern 1", tab: upDown([[6, 5], [6, 8], [5, 5], [5, 6], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7], [3, 8], [2, 5], [2, 8], [1, 5], [1, 8]]) },
      ] } },
  ];

  const byId = id => EXERCISES.find(e => e.id === id) || null;
  const pageFor = ex => ENGINES[ex.engine].page + "#" + ex.id;
  const api = { ENGINES, EXERCISES, byId, pageFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FretExercises = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
