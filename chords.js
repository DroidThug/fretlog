/* Chord shapes, low E → high e. -1 = muted, 0 = open. Shared by the pages and the node tests. */
(function (root) {
  "use strict";
  const CHORDS = {
    // Grade 1 — the 8 essential grips
    A: [-1, 0, 2, 2, 2, 0], D: [-1, -1, 0, 2, 3, 2], E: [0, 2, 2, 1, 0, 0], Am: [-1, 0, 2, 2, 1, 0],
    Em: [0, 2, 2, 0, 0, 0], Dm: [-1, -1, 0, 2, 3, 1], C: [-1, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3],
    // Grade 2
    Fmaj7: [-1, -1, 3, 2, 1, 0], Cadd9: [-1, 3, 2, 0, 3, 0], rockG: [3, 2, 0, 0, 3, 3],
    E5: [0, 2, 2, -1, -1, -1], A5: [-1, 0, 2, 2, -1, -1],
    // Grade 3 — barre chords and B7
    F: [1, 3, 3, 2, 1, 1], Bm: [-1, 2, 4, 4, 3, 2], B7: [-1, 2, 1, 2, 0, 2],
    "F#m": [2, 4, 4, 2, 2, 2], Bb: [-1, 1, 3, 3, 3, 1],
  };
  // Display names (keys stay hash-safe)
  const LABEL = { rockG: "G (rock)" };
  // Barre: fret and string range (0 = low E) drawn as a bar
  const BARRE = { F: { fret: 1, from: 0, to: 5 }, Bm: { fret: 2, from: 1, to: 5 }, "F#m": { fret: 2, from: 0, to: 5 }, Bb: { fret: 1, from: 1, to: 5 } };
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
  const STRING_NAMES = ["low E", "A", "D", "G", "B", "high e"];
  const label = k => LABEL[k] || k;
  const api = { CHORDS, LABEL, BARRE, OPEN_MIDI, STRING_NAMES, label };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FretChords = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
