# Fretlog practice

A small static site for practising guitar alongside [JustinGuitar](https://www.justinguitar.com/)'s free beginner course. It is the companion to *Fretlog*, a practice log kept as a claude.ai page. That page can't embed video or use the microphone, so this site does both.

- **Learn** (`learn.html`): Grade 1 lessons, module by module.
  - Embedded privacy-enhanced player (`youtube-nocookie.com`, `rel=0`).
  - Previous/next lesson (also the ← → keys).
  - Link to the lesson notes on justinguitar.com.
  - "Practice this" links to matching exercises.
  - Deep links: `learn.html#<lesson-slug>` or `learn.html#<videoId>`.
  - Grade 2 and 3 lesson lists aren't loaded yet; those pages say so and link to justinguitar.com.
- **Practice** (`index.html`): exercises for Grades 1–3. Each one runs on a small engine page that listens through the microphone or an amp's USB input. A grade switch in the top bar is shared with Learn and remembered.

Plain HTML, CSS and JS: no build step, no dependencies. The only external resource is Google Fonts. Every link is relative, so the site works from any sub-path (it is served at `/fretlog/`). The microphone needs https or localhost.

Run it locally:

```
python3 -m http.server   # from this folder, then open http://localhost:8000/
```

## Exercises

All content is one array in `exercises.js`: `{id, grade, engine, title, blurb, justinLessons, params}`.

| Engine | Grade 1 | Grade 2 | Grade 3 |
|---|---|---|---|
| **Chord changes** (`changes.html`) | One-minute changes, Justin's 15 pairs (A–D … Em–C) | C–Fmaj7, Am–Fmaj7, rock G–Cadd9, D–Fmaj7, Em–Cadd9 | F–C, F–G, Bm–G, Bm–D, F–Am |
| **Strum timing** (`timing.html`) | Downstrums on the beat · Strumming on 1 · THE pattern D · DU · UDU | Eighth-note down-ups · a 6/8 pattern | Sixteenth-note pattern · shuffle (swung eighths) |
| **Chord check** (`check.html`) | The 8 essential grips | Fmaj7, Cadd9, rock G, E5, A5 | F, Bm, B7, F♯m, B♭ |
| **Note finder** (`notes.html`) | Open string names | Naturals on strings 6 & 5, frets 0–12 | All notes on strings 6, 5 & 4, with sharps and flats |
| **Riff & scale follow** (`follow.html`) | Strings 6 & 5 note drills (frets 0–3) | A minor pentatonic, pattern 1 | Pentatonic pattern 2, patterns 1→2, A blues scale |

Deep links:

- `<engine>.html#<exercise-id>`, or `exercise.html#<exercise-id>`, which redirects.
- Extras after a slash: `changes.html#g1-changes/A-D`, `check.html#g1-check/C`, `follow.html#g3-follow/2`.
- Chord changes also accepts the short form `changes.html#A-D`.

Every run ends with a result card. It has a **Copy for Fretlog** line, such as `A–D 24` or `Grade 1 · Strum timing · THE strumming pattern · 60 bpm · mean −12 ms · 86% in time`, and a link to open Fretlog. History, best result and a sparkline are kept per exercise, and the Practice page shows the best result for each one.

The riff and scale content is original drills and standard scale patterns, not transcriptions of songs.

## How detection works

All signal processing is in `dsp.js`. It is written as pure functions and small state machines, so it runs unchanged in the browser and in the node tests. The tunable constants are in `FretDSP.C`.

### Chord changes

1. **Frames.** An `AnalyserNode` (fftSize 8192, no smoothing) is read every 20 ms, and the dB spectrum is converted to linear magnitude.
2. **Onsets.** Spectral flux is the positive change in magnitude between 80 Hz and 4 kHz, divided by the frame's energy in that band. An onset fires when all of these hold:
   - flux exceeds `max(median of the last ~1 s × K, 0.12)`, where K comes from the Sensitivity slider (default 2.5);
   - the input level is above the noise gate (room noise measured for 1 s × 2.5 × the gate slider);
   - the detector has re-armed (flux fell back below threshold);
   - at least 150 ms have passed since the last onset.
3. **Chroma.** From 60 ms to 210 ms after the onset, each frame becomes a 12-bin pitch-class profile. Only spectral peaks between 80 Hz and 2 kHz count (parabolic frequency refinement, square-root magnitude). The profiles are averaged and L2-normalised.
4. **Calibration.** You strum each chord 3 times. The average becomes that chord's template, stored per chord and per input device.
   - Each calibration strum must be *clean*: it scores ≥ `CAL_MIN` = 0.85 against the chord's ideal chroma (see Chord check) and no chord tone is quiet. Otherwise it doesn't count, and you're told why ("the B string may be muted" only when that can be pinned on one string).
   - After 3 rejects in a row, "Use it anyway" stores a template flagged *rough*, with a link to Chord check for that chord.
   - An uncalibrated chord falls back to its generic (ideal) chroma, and the page says so.
   - Limit: a muted string whose note is doubled, or is an overtone of another string, can't be heard missing (for example C's A or G string, E's G string, G's B string). Chord check's string-by-string mode catches those.
5. **Classification.** The strum's chroma is compared with both templates by cosine similarity. The best match is accepted only if all of these hold:
   - similarity ≥ 0.75;
   - it beats the other template by `min(0.04, 0.25 × (1 − template similarity))`;
   - the strum is tonal: the 4 strongest pitch classes hold ≥ 65 % of the chroma energy, which rejects knocks and noise.

   Anything else is "unclear".
6. **Counting.** A change is an accepted chord that differs from the last accepted one. Manual taps (the number pad or Space) are counted separately.
   - **Clean only** (the default) counts a change only when the arriving strum also passes the clean gate at `RUN_CLEAN_MIN` = 0.82. A sloppy strum of the right chord isn't counted, but it does become the "last chord", so the next clean switch still counts.
   - **All changes** counts every switch and still reports how many were sloppy.
   - "Copy for Fretlog" uses the clean count in clean-only mode. History keeps the two modes in separate groups, so bests compare like with like.

### Strum timing

- **Metronome.** A Web Audio click at 2.5 kHz, scheduled with a 120 ms lookahead, accent on 1.
- **Tap input (dependable).** The tap's event time is mapped onto the audio clock.
- **Mic input (beta).** An AudioWorklet streams raw samples with sample-accurate frame numbers. A 1024-point log-magnitude spectral flux, with a 128-sample hop, 150 Hz–6 kHz, and the reference frame max-filtered across bins, is compared with an adaptive median threshold. The band 2.1–2.9 kHz is ignored so click bleed isn't heard as a strum.
- **Scoring.** Each strum is matched to the nearest expected hit, within ±150 ms and never more than 45 % of the gap to a neighbouring hit. Only the pattern's own hits are expected; swing moves the "and" to ⅔ of the beat. Latency calibration takes the median offset over 8 clicks and subtracts it from later runs. The result shows:
  - mean offset (negative = early);
  - spread (standard deviation);
  - % of expected hits within ±40 ms;
  - misses and extra strums, counted only inside the scored bars.

### Chord check

- **Strum mode** compares the strum's chroma with an *ideal* chroma built from the chord shape in standard tuning: partials 1–6 of every sounding string, weighted h^-0.5, so no calibration is needed. Score = cosine similarity; "clean" ≥ 0.90.
  - A chord tone below half its ideal share is reported as quiet.
  - It is pinned on a specific string only when that pitch class is unique in the shape *and* is not a harmonic of another string. For example, C's G string is also the 3rd harmonic of C, so a strum can't prove it rang.
  - Unexpected strong non-chord notes are reported as possible buzzes or wrong frets.
- **String-by-string mode** is the real per-string check. YIN pitch detection runs on 2048-sample frames. A note must hold 3 frames before it counts, and a repeated note counts again after a gap or a fresh attack. Each string is accepted within ±40 cents, or exactly an octave off to allow for YIN slips on a weak low-E fundamental (this tolerance is only used here).

### Note finder and riff/scale follow

These use the same YIN pitch path and note tracker. Matching is octave-exact (±40 cents), so the open low E doesn't count for the 12th fret. The note finder picks prompts adaptively: notes you missed or were slow on come up more often, and these stats are kept per exercise. The follower moves through the tab when the expected note is heard. Re-detecting the note that is still ringing is ignored, and anything else counts as a slip. A run is clean when it has no slips and is timed from its first correct note.

## Tests

```
node test/dsp.test.mjs
```

The tests need no dependencies, and this one command runs every suite: chord changes, timing, check, pitch, notes and data.

Signals are synthesised: guitar-like strums and plucks built from the real notes of each chord shape in standard tuning, with 12 decaying, slightly inharmonic partials per string, random brightness and detune, staggered strums, pick noise, room noise and 60 Hz hum. They go through the same pipeline the pages use: FFT/analyser frames, 128-sample worklet chunks, YIN frames. Results at the time of writing:

| Suite | Result |
|---|---|
| Changes: calibrate then classify, 80 strums per pair | A–D 100 %, C–G 100 %, Am–Em 98.8 %, E–Em 98.8 % (1 wrong), C–Fmaj7 100 %, F–C 100 %, Bm–D 98.8 % (1 wrong) |
| Changes: simulated 60 s A/D run with gaps, dropped strings and a noise burst | all-changes mode 18 of 18 across 6 seeds; clean-only 16–18 clean + 0–2 sloppy, and every strum flagged sloppy really had a dropped string; burst → unclear |
| Changes: calibration gate | 180/180 clean strums of all 18 chords accepted (lowest score 0.863); single muted string rejected 10/10 for Am-B, Em-G, Dm-high e, Bm-B, Fmaj7-high e, 7/10 for D-high e; 0/10 for masked or doubled notes (C-A, C-G, E-G, G-B); two muted strings: D-B+e 10/10, A-G+B 8/10, C-A+e and G-B+e 0/10; wrong chord (Am for C) 10/10 |
| Changes: clean-only run, Em–Am with 6 switches onto a B-muted Am | 17 clean + 6 sloppy (exactly as played); all-changes mode 23/23 |
| Changes: one strum + 6 s sustain (± tremolo) | exactly 1 onset; 5 s of room noise → 0 |
| Timing, **tap** | latency 24.6 ms estimated (25 ms true); mean and SD within 0.4 ms of truth; misses/extras exact |
| Timing, **mic (beta)** | mean within 0.4–9.4 ms of truth and 0–10 misses per scenario, but SD inflated (18–48 ms vs 8–30 true) and 0.7–3.4 extra onsets per strum during ring-out. Reported as **XFAIL**, not hidden. Click bleed alone → 0 onsets. |
| Chord check | all 18 chords score 0.89–0.98 on full strums; 4/180 false flags; a muted, unmasked string (Am's B string) named 10/10; masked strings (C's G, E's G, D's high e) can't be named from a strum (reported as INFO); Am played for C scores 0.77 vs 0.96 |
| YIN | 111/111 tones E2–E5 within 3.5 cents, also with a −20 dB fundamental; low E with a −26 dB fundamental → 82.56 Hz |
| Note tracker / follower | repeated notes re-counted; pentatonic pattern 1 clean (23/23); one inserted wrong fret → 1 slip; low-string drill clean |

The pages were also exercised end to end in headless Chrome, using synthesized WAV files as a fake microphone (44.1 kHz):

- chord check: C 96 %; plucked C 5/5 strings;
- chord changes: calibrate A and D, then a 30 s run with 19 changes heard, 100 % clean;
- riff follow: 2 clean runs of 8.4 s;
- note finder: 12/12 prompts answered;
- tap-mode timing: a full run, with deliberate misses detected.

**Synthetic tests are not real-guitar accuracy.** They show that the pipeline is wired correctly and the constants are sane. Real guitars, rooms, mics, amps and players are messier. In particular:

- barre chords that buzz or mute under the barre;
- strings that are slightly out of tune;
- a phone mic's low-frequency roll-off;
- an amp's distortion, which adds partials;
- percussive strumming.

## Known limitations

- **Mic-mode strum timing is beta.** Use Tap for numbers you trust.
- **Similar-sounding pairs.** E–Em templates are 0.92 similar on synthetic strums, so the page warns above 0.90. Barre-chord pairs are likely shakier on a real guitar than in the synthetic test.
- **Chord check.** A strum can't prove that a string whose note is doubled, or hidden in other strings' harmonics, actually rang. Use string-by-string mode for that.
- **Lesson player.** The embed is YouTube's own iframe, so it carries YouTube's in-player branding and its "Watch on YouTube" control. This site never links to youtube.com itself, and `rel=0` limits suggestions to the same channel.
- **Grade 2 and 3 lessons** aren't loaded, because their titles, slugs and video IDs haven't been verified.

## Privacy

Audio never leaves your browser. Nothing is uploaded or recorded, and there is no analytics or server code. Calibration templates, latency, settings and history live in `localStorage` on your device only. The lesson player is the privacy-enhanced `youtube-nocookie.com` embed.

## Credits

Built for personal use with JustinGuitar's free lessons. Lesson titles and video IDs belong to JustinGuitar, and the lessons themselves are on [justinguitar.com](https://www.justinguitar.com/). This project isn't affiliated with JustinGuitar.

MIT licensed. See `LICENSE`.
