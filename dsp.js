/* Fretlog DSP — onset detection, chroma, chord classification, change counting.
   Pure functions + small state machines, shared by changes.html (browser) and
   test/dsp.test.mjs (node). Magnitude spectra are linear (|X|), length fftSize/2. */
(function (root) {
  "use strict";

  // Tunable constants. The page and the tests both read these.
  const C = {
    FFT_SIZE: 8192,
    HOP_MS: 20,            // analysis hop (one AnalyserNode read per hop)
    FLUX_LO_HZ: 80,        // spectral-flux band
    FLUX_HI_HZ: 4000,
    CHROMA_LO_HZ: 80,      // chroma band
    CHROMA_HI_HZ: 2000,
    SENSITIVITY_K: 2.5,    // default: onset when flux > median(recent flux) * K ...
    FLUX_MIN: 0.12,        // ... and flux > FLUX_MIN (flux is normalised by frame energy, 0..~1)
    MEDIAN_FRAMES: 50,     // ~1 s of flux history for the adaptive threshold
    REFRACTORY_MS: 150,
    CHROMA_DELAY_MS: 60,   // start averaging chroma this long after the onset fires
    CHROMA_SPAN_MS: 150,   // ... and average over this span
    MIN_SIM: 0.75,         // accept the best template only if cosine >= MIN_SIM
    MIN_MARGIN: 0.04,      // ... and it beats the other template by this much
    MARGIN_FRAC: 0.25,     // ... capped at MARGIN_FRAC x (1 - template similarity), so near-identical pairs (E/Em) stay usable
    MIN_TONALITY: 0.65,    // strums whose chroma is this flat (noise, knocks) are "unclear"
    SIMILAR_WARN: 0.9,     // templates closer than this are hard to tell apart
    // --- strum timing (short-frame log spectral flux on raw samples from an AudioWorklet) ---
    TF_FRAME: 1024,        // FFT frame (21 ms at 48 kHz), Hann window
    TF_HOP: 128,           // hop = one AudioWorklet render quantum (2.7 ms at 48 kHz)
    TF_LO_HZ: 150, TF_HI_HZ: 6000, // flux band
    TF_GAMMA: 1000,        // log compression: log(1 + GAMMA * |X| / N)
    TF_K: 1.5,             // onset when flux > median(last ~120 ms) * K + DELTA, rising edge
    TF_DELTA: 1.0,
    TF_MEDIAN_MS: 120,
    CLICK_HZ: 2500,        // metronome click pitch; flux ignores CLICK_HZ ± CLICK_NOTCH_HZ so click bleed isn't a strum
    CLICK_NOTCH_HZ: 400,
    // --- chord check ---
    IDEAL_HARMONICS: 6,    // ideal chroma: each string's partials 1..6, weighted h^-0.5 (matches the sqrt peak compression)
    CHECK_GOOD: 0.9,       // match score shown as "clean"
    WEAK_RATIO: 0.5,       // a chord tone below this fraction of its ideal share is "weak"
    EXTRA_LEVEL: 0.3,      // a non-chord pitch class above this (normalised) is an "unexpected note"
    // --- pitch (YIN) ---
    YIN_THRESHOLD: 0.15,
    YIN_MIN_HZ: 70, YIN_MAX_HZ: 1100,
    PITCH_MAX_APERIODICITY: 0.25, // frames noisier than this are ignored
    PITCH_STABLE_FRAMES: 3,       // a note must hold this many frames (~60 ms) before it counts
    PITCH_TOL_CENTS: 40,
    TIMING_TOL_MS: 40,     // a hit within ±this of the beat counts as "in time"
    TIMING_WINDOW_MS: 150, // the furthest an onset can be from an expected hit and still be matched to it
    CHROMA_POWER: 0.5,     // peak-magnitude compression (0.5 = sqrt)
    CHROMA_TILT: 0,        // weight peaks by (CHROMA_LO_HZ/f)^TILT to favour fundamentals over harmonics
  };

  // ---------- basic helpers ----------
  function hzToBin(hz, sampleRate, fftSize) { return Math.round(hz * fftSize / sampleRate); }

  function rms(buf, from) {
    let s = 0, n = 0;
    for (let i = from || 0; i < buf.length; i++) { s += buf[i] * buf[i]; n++; }
    return n ? Math.sqrt(s / n) : 0;
  }

  // AnalyserNode.getFloatFrequencyData gives dB; convert to linear magnitude in place-ish.
  function dbToMag(db, out) {
    out = out || new Float32Array(db.length);
    for (let i = 0; i < db.length; i++) {
      const v = db[i];
      out[i] = Number.isFinite(v) ? Math.pow(10, v / 20) : 0;
    }
    return out;
  }

  function l2normalize(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    s = Math.sqrt(s);
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = s > 0 ? v[i] / s : 0;
    return out;
  }

  function cosine(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : 0;
  }

  // ---------- FFT (radix-2, in place) — used by tests; the browser uses AnalyserNode ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  // Blackman window, same as the Web Audio AnalyserNode.
  function blackman(n) {
    const w = new Float64Array(n), a = 0.16, a0 = (1 - a) / 2, a1 = 0.5, a2 = a / 2;
    for (let i = 0; i < n; i++) w[i] = a0 - a1 * Math.cos(2 * Math.PI * i / n) + a2 * Math.cos(4 * Math.PI * i / n);
    return w;
  }

  // Linear magnitude spectrum of the last `win.length` samples ending at `end`, scaled like AnalyserNode (|X|/N).
  function magnitudeSpectrum(samples, end, win) {
    const n = win.length, re = new Float64Array(n), im = new Float64Array(n), start = end - n;
    for (let i = 0; i < n; i++) { const k = start + i; re[i] = (k >= 0 && k < samples.length ? samples[k] : 0) * win[i]; }
    fft(re, im);
    const out = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]) / n;
    return out;
  }

  // ---------- onset features ----------
  // Positive spectral flux in [lo,hi], normalised by the current frame's energy in that band,
  // so the value is level-independent (0 = nothing new, ~1 = everything new).
  function spectralFlux(prev, cur, lo, hi) {
    if (!prev) return 0;
    let pos = 0, tot = 0;
    for (let i = lo; i <= hi; i++) {
      const d = cur[i] - prev[i];
      if (d > 0) pos += d;
      tot += cur[i];
    }
    return tot > 0 ? pos / tot : 0;
  }

  // ---------- chroma ----------
  // 12-bin pitch-class profile (index 0 = C). Uses spectral peaks only (local maxima, parabolic
  // interpolation for frequency) so window leakage doesn't smear energy into neighbouring classes.
  // Peak magnitudes are square-root compressed so one loud string doesn't dominate.
  function chroma(mag, sampleRate, fftSize, opts) {
    const o = opts || {};
    const lo = Math.max(2, hzToBin(o.lo || C.CHROMA_LO_HZ, sampleRate, fftSize));
    const hi = Math.min(mag.length - 2, hzToBin(o.hi || C.CHROMA_HI_HZ, sampleRate, fftSize));
    let peak = 0;
    for (let i = lo; i <= hi; i++) if (mag[i] > peak) peak = mag[i];
    const out = new Array(12).fill(0);
    if (peak <= 0) return out;
    const floor = peak * 0.01; // ignore peaks 40 dB below the strongest
    const binHz = sampleRate / fftSize;
    for (let i = lo; i <= hi; i++) {
      const m = mag[i];
      if (m < floor || m <= mag[i - 1] || m < mag[i + 1]) continue;
      const a = mag[i - 1], c = mag[i + 1], den = a - 2 * m + c;
      const delta = den !== 0 ? 0.5 * (a - c) / den : 0;
      const f = (i + delta) * binHz;
      const midi = 69 + 12 * Math.log2(f / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      out[pc] += Math.pow(m, C.CHROMA_POWER) * (C.CHROMA_TILT ? Math.pow(C.CHROMA_LO_HZ / f, C.CHROMA_TILT) : 1);
    }
    return l2normalize(out);
  }

  // Share of chroma energy in the 4 strongest pitch classes: ~0.5 for broadband noise, higher for chords.
  function tonality(ch) {
    const s = ch.map(x => x * x).sort((a, b) => b - a);
    const tot = s.reduce((a, b) => a + b, 0);
    return tot > 0 ? (s[0] + s[1] + s[2] + s[3]) / tot : 0;
  }

  function averageVectors(vs) {
    const out = new Array(12).fill(0);
    vs.forEach(v => { for (let i = 0; i < 12; i++) out[i] += v[i]; });
    return l2normalize(out);
  }

  // ---------- onset detector ----------
  // process(flux, rms, tMs) -> true when an onset fires.
  // Fires on a rising edge only: after firing it disarms until flux falls back below threshold.
  function createOnsetDetector(opts) {
    const o = Object.assign({ k: C.SENSITIVITY_K, fluxMin: C.FLUX_MIN, noiseFloor: 0.002,
      refractoryMs: C.REFRACTORY_MS, medianFrames: C.MEDIAN_FRAMES }, opts || {});
    const hist = [];
    let lastOnset = -Infinity, armed = true;
    function median() {
      if (!hist.length) return 0;
      const s = hist.slice().sort((a, b) => a - b), m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    return {
      opts: o,
      threshold() { return Math.max(median() * o.k, o.fluxMin); },
      process(flux, level, t) {
        const thr = Math.max(median() * o.k, o.fluxMin);
        hist.push(flux);
        if (hist.length > o.medianFrames) hist.shift();
        const above = flux > thr;
        if (!above) { armed = true; return false; }
        if (!armed || level < o.noiseFloor || t - lastOnset < o.refractoryMs) return false;
        armed = false;
        lastOnset = t;
        return true;
      },
      reset() { hist.length = 0; lastOnset = -Infinity; armed = true; },
    };
  }

  // ---------- strum analyser: onset + delayed chroma window ----------
  // feed({mag, rms, t}) with one frame per hop; returns an array of events:
  //   {type:"onset", t}  and later  {type:"strum", t (onset time), chroma}
  function createStrumAnalyzer(opts) {
    const o = Object.assign({ sampleRate: 48000, fftSize: C.FFT_SIZE,
      delayMs: C.CHROMA_DELAY_MS, spanMs: C.CHROMA_SPAN_MS }, opts || {});
    const det = createOnsetDetector(o);
    const lo = hzToBin(C.FLUX_LO_HZ, o.sampleRate, o.fftSize), hi = hzToBin(C.FLUX_HI_HZ, o.sampleRate, o.fftSize);
    let prev = null, pending = null;
    function finish(events) {
      if (pending && pending.vs.length) events.push({ type: "strum", t: pending.t, chroma: averageVectors(pending.vs) });
      pending = null;
    }
    return {
      detector: det,
      feed(frame) {
        const ev = [];
        const flux = spectralFlux(prev, frame.mag, lo, hi);
        prev = Float32Array.from(frame.mag);
        const onset = det.process(flux, frame.rms, frame.t);
        if (onset) { finish(ev); pending = { t: frame.t, vs: [] }; ev.push({ type: "onset", t: frame.t, flux }); }
        if (pending) {
          const dt = frame.t - pending.t;
          if (dt >= o.delayMs && dt <= o.delayMs + o.spanMs) pending.vs.push(chroma(frame.mag, o.sampleRate, o.fftSize));
          if (dt >= o.delayMs + o.spanMs) finish(ev);
        }
        ev.flux = flux;
        return ev;
      },
      reset() { det.reset(); prev = null; pending = null; },
    };
  }

  // ---------- classifier ----------
  // templates: {name: chromaVector}. Returns {chord: name|null, best, sim, margin, sims}.
  function classify(ch, templates, opts) {
    const o = Object.assign({ minSim: C.MIN_SIM, minMargin: C.MIN_MARGIN }, opts || {});
    const sims = {};
    let best = null, bestSim = -1, second = -1;
    for (const name in templates) {
      const s = cosine(ch, templates[name]);
      sims[name] = s;
      if (s > bestSim) { second = bestSim; bestSim = s; best = name; } else if (s > second) second = s;
    }
    const margin = second < 0 ? bestSim : bestSim - second;
    // The needed margin shrinks for templates that are close together (otherwise E vs Em would be mostly "unclear").
    const names = Object.keys(templates);
    let need = o.minMargin;
    if (names.length === 2) need = Math.min(need, C.MARGIN_FRAC * (1 - cosine(templates[names[0]], templates[names[1]])));
    const ton = tonality(ch);
    const ok = best != null && bestSim >= o.minSim && margin >= need && ton >= C.MIN_TONALITY;
    return { chord: ok ? best : null, best, sim: bestSim, margin, sims, tonality: ton };
  }

  // ---------- change counter ----------
  function createChangeCounter() {
    const s = { changes: 0, clean: 0, unclear: 0, last: null };
    return {
      state: s,
      push(chord) { // chord name, or null for an unclear strum. Returns true if this was a change.
        if (!chord) { s.unclear++; return false; }
        s.clean++;
        const changed = s.last != null && chord !== s.last;
        if (changed) s.changes++;
        s.last = chord;
        return changed;
      },
      reset() { s.changes = 0; s.clean = 0; s.unclear = 0; s.last = null; },
    };
  }


  // ---------- strum timing ----------
  // Onset detector for timing. push(chunk, startSample) takes raw samples in any chunk size and returns
  // onset times as sample indices (the end of the frame where flux crossed the threshold; the constant
  // window delay is removed by latency calibration). Log-magnitude flux against a max-filtered frame from
  // 2 hops back (SuperFlux-style) so beating between chord notes and vibrato don't trigger it.
  function createFluxOnsetDetector(opts) {
    const o = Object.assign({ sampleRate: 48000, frame: C.TF_FRAME, hop: C.TF_HOP, lo: C.TF_LO_HZ, hi: C.TF_HI_HZ,
      gamma: C.TF_GAMMA, k: C.TF_K, delta: C.TF_DELTA, medianMs: C.TF_MEDIAN_MS, refractoryMs: 80,
      notchHz: C.CLICK_HZ, notchWidth: C.CLICK_NOTCH_HZ, minRms: 0 }, opts || {});
    const N = o.frame, win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const binHz = o.sampleRate / N, lo = Math.max(1, Math.round(o.lo / binHz)), hi = Math.min(N / 2 - 2, Math.round(o.hi / binHz));
    const use = new Uint8Array(N / 2);
    for (let b = lo; b <= hi; b++) use[b] = !(o.notchHz && Math.abs(b * binHz - o.notchHz) <= o.notchWidth);
    const buf = new Float32Array(N), re = new Float64Array(N), im = new Float64Array(N);
    const hist = [new Float64Array(N / 2), new Float64Array(N / 2)]; // log spectra 1 and 2 hops back
    const medN = Math.max(5, Math.round(o.medianMs / 1000 * o.sampleRate / o.hop)), fluxes = [];
    let fill = 0, sinceHop = 0, total = 0, armed = true, last = -Infinity, frames = 0;
    function analyse(endSample) {
      let e = 0;
      for (let i = 0; i < N; i++) { const v = buf[(fill + i) % N]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      fft(re, im);
      const cur = new Float64Array(N / 2), ref = hist[1];
      let flux = 0;
      for (let b = 1; b < N / 2 - 1; b++) cur[b] = Math.log1p(o.gamma * Math.hypot(re[b], im[b]) / N);
      for (let b = lo; b <= hi; b++) if (use[b]) {
        const r = Math.max(ref[b - 1], ref[b], ref[b + 1]), d = cur[b] - r;
        if (d > 0) flux += d;
      }
      hist[1] = hist[0]; hist[0] = cur; frames++;
      const sorted = fluxes.slice().sort((x, y) => x - y), med = sorted.length ? sorted[sorted.length >> 1] : 0;
      const thr = med * o.k + o.delta, rms = Math.sqrt(e / N);
      fluxes.push(flux); if (fluxes.length > medN) fluxes.shift();
      if (frames < 3) return -1;
      if (flux > thr && rms >= o.minRms) {
        const ok = armed && (endSample - last) / o.sampleRate * 1000 >= o.refractoryMs;
        armed = false;
        if (ok) { last = endSample; return endSample; }
      } else if (flux <= thr) armed = true;
      return -1;
    }
    return {
      opts: o,
      push(chunk, start) {
        const out = [];
        for (let i = 0; i < chunk.length; i++) {
          buf[fill] = chunk[i]; fill = (fill + 1) % N; total++;
          if (++sinceHop >= o.hop) { sinceHop = 0; const h = analyse(start + i + 1); if (h >= 0) out.push(h); }
        }
        return out;
      },
      reset() { buf.fill(0); hist[0].fill(0); hist[1].fill(0); fluxes.length = 0; fill = 0; sinceHop = 0; armed = true; last = -Infinity; frames = 0; },
    };
  }

  // Expected hit times (seconds) for a pattern. hits are in beats from the bar start (0 = beat 1, 1.5 = "2 and").
  // swing: "and" positions (x.5) move to x.667 (swung eighths).
  function patternTimes(p) {
    const beat = 60 / p.bpm, out = [];
    for (let bar = 0; bar < p.bars; bar++) p.hits.forEach((h, i) => {
      let pos = h;
      if (p.swing && Math.abs(h % 1 - 0.5) < 1e-6) pos = Math.floor(h) + 2 / 3;
      out.push({ t: p.t0 + (bar * p.beatsPerBar + pos) * beat, bar, i });
    });
    return out;
  }

  // Match onsets (seconds) to expected hits. Each onset is used at most once, nearest pairs first.
  // window (s) is capped at 45% of the gap to the neighbouring expected hits so it can't steal a neighbour's strum.
  function matchHits(onsets, expected, windowS) {
    const W = windowS ?? C.TIMING_WINDOW_MS / 1000;
    const win = expected.map((e, i) => {
      const gPrev = i > 0 ? e.t - expected[i - 1].t : Infinity, gNext = i < expected.length - 1 ? expected[i + 1].t - e.t : Infinity;
      return Math.min(W, 0.45 * Math.min(gPrev, gNext));
    });
    const pairs = [];
    expected.forEach((e, i) => onsets.forEach((t, j) => { const d = t - e.t; if (Math.abs(d) <= win[i]) pairs.push([Math.abs(d), i, j, d]); }));
    pairs.sort((a, b) => a[0] - b[0]);
    const offs = new Array(expected.length).fill(null), used = new Set();
    pairs.forEach(([, i, j, d]) => { if (offs[i] == null && !used.has(j)) { offs[i] = d; used.add(j); } });
    return { offsets: offs, extras: onsets.length - used.size, extraTimes: onsets.filter((_, j) => !used.has(j)) };
  }

  // Stats in ms: mean (negative = early), sd, % of expected hits within ±tol, hits, misses.
  function timingStats(offsets, tolMs) {
    const tol = tolMs ?? C.TIMING_TOL_MS;
    const ms = offsets.filter(x => x != null).map(x => x * 1000);
    const mean = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
    const sd = ms.length > 1 ? Math.sqrt(ms.reduce((a, b) => a + (b - mean) ** 2, 0) / (ms.length - 1)) : 0;
    const inTime = ms.filter(x => Math.abs(x) <= tol).length;
    return { mean, sd, hits: ms.length, misses: offsets.length - ms.length, inTimePct: offsets.length ? Math.round(inTime / offsets.length * 100) : 0 };
  }

  function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }


  // ---------- chord check ----------
  const OPEN = [40, 45, 50, 55, 59, 64];
  const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const midiName = m => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
  const shapeMidis = shape => shape.map((f, i) => f < 0 ? null : OPEN[i] + f);

  // Expected chroma for a chord shape in standard tuning (no calibration needed).
  function idealChroma(shape) {
    const out = new Array(12).fill(0);
    shapeMidis(shape).forEach(m => {
      if (m == null) return;
      for (let h = 1; h <= C.IDEAL_HARMONICS; h++) {
        const pc = ((Math.round(m + 12 * Math.log2(h)) % 12) + 12) % 12;
        out[pc] += Math.pow(h, -0.5);
      }
    });
    return l2normalize(out);
  }

  // Compare a strum's chroma with the shape's ideal. Returns {score, weak:[{pc, name, string|null}], extra:[{pc,name}]}.
  // A weak pitch class is pinned on a string only when no other string in the shape plays it. Even then, other
  // strings' harmonics can fill it in (C's 3rd harmonic is G), so a missing flag doesn't prove the string rang:
  // string-by-string mode is the real per-string check.
  function chordCheck(ch, shape) {
    const ideal = idealChroma(shape), score = cosine(ch, ideal);
    const mids = shapeMidis(shape), tones = {};
    mids.forEach((m, i) => { if (m != null) (tones[m % 12] = tones[m % 12] || []).push(i); });
    const weak = [], extra = [];
    Object.keys(tones).forEach(k => {
      const pc = +k;
      if (ch[pc] >= ideal[pc] * C.WEAK_RATIO) return;
      // masked: the pitch class is also a harmonic of another string, so its weakness can't be pinned on one string
      const masked = mids.some((m, j) => m != null && m % 12 !== pc && [2, 3, 4, 5, 6].some(h => Math.round(m + 12 * Math.log2(h)) % 12 === pc));
      weak.push({ pc, name: NOTE_NAMES[pc], string: tones[pc].length === 1 && !masked ? tones[pc][0] : null });
    });
    for (let pc = 0; pc < 12; pc++) if (!tones[pc] && ideal[pc] < 0.15 && ch[pc] > C.EXTRA_LEVEL) extra.push({ pc, name: NOTE_NAMES[pc] });
    return { score, weak, extra, ideal };
  }

  // ---------- pitch: YIN ----------
  // Returns {hz, aperiodicity} or null. buf: time-domain samples (2048 at 48 kHz covers low E).
  function yin(buf, sampleRate, opts) {
    const o = Object.assign({ minHz: C.YIN_MIN_HZ, maxHz: C.YIN_MAX_HZ, threshold: C.YIN_THRESHOLD }, opts || {});
    const tauMax = Math.min(Math.floor(sampleRate / o.minHz), Math.floor(buf.length / 2)), tauMin = Math.max(2, Math.floor(sampleRate / o.maxHz));
    const W = buf.length - tauMax, d = new Float64Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const x = buf[j] - buf[j + tau]; s += x * x; }
      d[tau] = s;
    }
    // cumulative mean normalised difference
    const c = new Float64Array(tauMax + 1); c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; c[tau] = run > 0 ? d[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (c[t] < o.threshold) { while (t + 1 <= tauMax && c[t + 1] < c[t]) t++; tau = t; break; }
    }
    if (tau < 0) { // no dip below threshold: take the global minimum, flagged by its aperiodicity
      let best = tauMin; for (let t = tauMin; t <= tauMax; t++) if (c[t] < c[best]) best = t;
      tau = best;
    }
    if (tau <= tauMin || tau >= tauMax) return null;
    const a = c[tau - 1], b = c[tau], e = c[tau + 1], den = a - 2 * b + e;
    const t = den !== 0 ? tau + 0.5 * (a - e) / den : tau;
    return { hz: sampleRate / t, aperiodicity: b };
  }
  const hzToMidi = hz => 69 + 12 * Math.log2(hz / 440);

  // Turns per-frame pitch into note events. feed({hz, aperiodicity, rms, t}) -> {midi, cents, hz, t} | null.
  // A repeated note counts again after a gap or a fresh attack (level jump).
  function createNoteTracker(opts) {
    const o = Object.assign({ stable: C.PITCH_STABLE_FRAMES, maxAp: C.PITCH_MAX_APERIODICITY, minRms: 0.003, attackRatio: 1.4 }, opts || {});
    let cand = null, count = 0, lastEmit = null, gap = 0, fresh = true, sum = 0;
    const lv = [];
    return {
      opts: o,
      feed(f) {
        const attack = lv.length === 3 && f.rms > Math.max(Math.min(...lv) * o.attackRatio, o.minRms * 2);
        lv.push(f.rms); if (lv.length > 3) lv.shift();
        const valid = f.hz && f.aperiodicity <= o.maxAp && f.rms >= o.minRms;
        if (!valid) { count = 0; cand = null; if (++gap >= 3) fresh = true; return null; }
        gap = 0;
        if (attack) { fresh = true; count = 0; cand = null; }
        const m = hzToMidi(f.hz), n = Math.round(m);
        if (n === cand) { count++; sum += m; } else { cand = n; count = 1; sum = m; }
        if (count === o.stable && (fresh || n !== lastEmit)) {
          lastEmit = n; fresh = false;
          const mm = sum / count;
          return { midi: n, cents: Math.round((mm - n) * 100), hz: 440 * Math.pow(2, (mm - 69) / 12), t: f.t };
        }
        return null;
      },
      reset() { cand = null; count = 0; lastEmit = null; gap = 0; fresh = true; lv.length = 0; },
    };
  }

  // Does a played note match the target? Within tol cents, or exactly an octave off (YIN octave slip on weak fundamentals).
  function noteMatches(midiFloat, target, tolCents) {
    const tol = (tolCents ?? C.PITCH_TOL_CENTS) / 100;
    return [0, 12, -12].some(k => Math.abs(midiFloat - (target + k)) <= tol) ? (Math.abs(midiFloat - target) <= tol ? "exact" : "octave") : null;
  }

  const api = { C, hzToBin, rms, dbToMag, l2normalize, cosine, fft, blackman, magnitudeSpectrum,
    spectralFlux, chroma, tonality, averageVectors, createOnsetDetector, createStrumAnalyzer, classify, createChangeCounter,
    createFluxOnsetDetector, patternTimes, matchHits, timingStats, median,
    NOTE_NAMES, OPEN, midiName, shapeMidis, idealChroma, chordCheck, yin, hzToMidi, createNoteTracker, noteMatches };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FretDSP = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
