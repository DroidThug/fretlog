# Fretlog practice

A small static site for practising guitar alongside [JustinGuitar](https://www.justinguitar.com/)'s free beginner course. It is the companion to *Fretlog*, a practice log kept as a claude.ai page. That page can't embed video or use the microphone, so this site does both.

- **Learn** (`learn.html`) has the Grade 1 lessons module by module, with an embedded privacy-enhanced player (`youtube-nocookie.com`, `rel=0`). There are links to the lesson notes on justinguitar.com and "Practice this" links to matching exercises. Grade 2 and 3 lesson lists aren't loaded yet.
- **Practice** (`index.html`) has exercises for Grades 1–3. Each one runs on a small engine page that listens through the microphone or an amp's USB input.

Plain HTML, CSS and JS: no build step, no dependencies. The only external resource is Google Fonts. Every link is relative, so the site works from any sub-path (it is served at `/fretlog/`).

## Exercises

| Engine | Grade 1 | Grade 2 | Grade 3 |
|---|---|---|---|
| Chord changes (`changes.html`) | One-minute changes, Justin's 15 pairs | Fmaj7 / Cadd9 / rock G pairs | Barre pairs (F, Bm) |

Deep links: `<engine>.html#<exercise-id>`, or `exercise.html#<exercise-id>`, which redirects. Chord changes also accepts `changes.html#A-D` and `changes.html#g1-changes/A-D`. The content lives in `exercises.js` as one array: `{id, grade, engine, title, blurb, justinLessons, params}`.

## How detection works

All signal processing is in `dsp.js`. It is written as pure functions and small state machines, so it runs unchanged in the browser and in node tests.

### Chord changes

1. **Frames.** A Web Audio `AnalyserNode` (fftSize 8192, no smoothing) is read every 20 ms. The dB spectrum is converted to linear magnitude.
2. **Onsets.** Spectral flux is the positive change in magnitude between 80 Hz and 4 kHz, divided by the frame's energy in that band, so it doesn't depend on level. An onset fires when all of these hold:
   - flux exceeds `max(median of the last ~1 s × K, 0.12)`, where K comes from the Sensitivity slider (default 2.5);
   - the RMS of the newest 1024 samples is above the noise gate (room noise measured for 1 s when the mic starts × 2.5 × the gate slider);
   - the detector has re-armed, which happens when flux falls back below threshold;
   - at least 150 ms have passed since the last onset.
3. **Chroma.** From 60 ms to 210 ms after the onset, each frame becomes a 12-bin pitch-class profile. Only spectral peaks between 80 Hz and 2 kHz count: local maxima, frequency refined by parabolic interpolation, square-root compressed. The profiles are averaged and L2-normalised.
4. **Calibration.** You strum each chord 3 times. The averaged chroma becomes that chord's template. Templates are stored per chord and per input device.
5. **Classification.** The strum's chroma is compared with both templates by cosine similarity. The best match is accepted only if all of these hold:
   - similarity ≥ 0.75;
   - it beats the other template by `min(0.04, 0.25 × (1 − similarity between the two templates))`, so near-identical pairs like E/Em stay usable;
   - the chroma isn't flat: the 4 strongest pitch classes hold ≥ 65 % of the energy, which rejects knocks and noise bursts.

   Anything else counts as "unclear".
6. **Counting.** A change is an accepted chord that differs from the previous accepted chord. You can also add changes by hand (tap the number or press Space); these are counted separately.

## Tests

```
node test/dsp.test.mjs
```

The tests need no dependencies and run every suite. They build guitar-like strums by additive synthesis: the real notes of each chord shape in standard tuning, 12 decaying, slightly inharmonic partials per string, a staggered strum, random detune and brightness, pick noise, room noise and 60 Hz hum. The audio then goes through the same FFT → onset → chroma → classifier pipeline that the page uses.

**Synthetic tests are not real-guitar accuracy.** They show the pipeline is wired correctly and the constants are sane. Real guitars, rooms, mics and players are messier.

## Privacy

Audio never leaves your browser. Nothing is uploaded or recorded, and there is no analytics. Calibration templates, settings and run history live in `localStorage` on your device only. The lesson player is the privacy-enhanced `youtube-nocookie.com` embed. The site never links to youtube.com itself.

## Credits

Built for personal use with JustinGuitar's free lessons. Lesson titles and video IDs belong to JustinGuitar, and the lessons themselves are on [justinguitar.com](https://www.justinguitar.com/). This project isn't affiliated with JustinGuitar. Riff and scale drills are original exercises and standard scale patterns, not song transcriptions.

MIT licensed. See `LICENSE`.
