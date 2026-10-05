/* Shared page runtime: storage, nav + grade switch, chord diagrams, mic input, history, copy, wake lock.
   Needs chords.js, lessons.js, exercises.js and dsp.js loaded first. */
(function () {
  "use strict";
  const F = (window.F = {});
  const D = window.FretDSP, CH = window.FretChords, EX = window.FretExercises, LS = window.FretLessons;

  F.$ = (s, r) => (r || document).querySelector(s);
  F.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  F.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- storage (every access guarded; the site must work without it) ----------
  const P = "fretlog.";
  F.store = {
    get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(P + k); } catch (e) { /* ignore */ } },
  };

  // ---------- grade ----------
  F.grade = () => { const g = +F.store.get("grade", 1); return g === 2 || g === 3 ? g : 1; };
  F.setGrade = g => { F.store.set("grade", g); window.dispatchEvent(new CustomEvent("fret:grade", { detail: g })); };

  // ---------- chrome: top bar + footer ----------
  // active: "learn" | "practice". onGrade(g): optional override (engine pages jump to the hub).
  F.chrome = function (active, onGrade) {
    const top = document.createElement("header");
    top.className = "top";
    top.innerHTML = `<div class="top-in">
      <a class="brand" href="index.html" aria-label="Fretlog practice home"><i aria-hidden="true"></i><span>Fretlog</span></a>
      <nav class="nav" aria-label="Sections">
        <a href="learn.html"${active === "learn" ? ' aria-current="page"' : ""}>Learn</a>
        <a href="index.html"${active === "practice" ? ' aria-current="page"' : ""}>Practice</a>
      </nav>
      <div class="grade" role="group" aria-label="Grade"><span>Grade</span><div class="seg">
        ${[1, 2, 3].map(g => `<button type="button" data-g="${g}" aria-pressed="${F.grade() === g}" aria-label="Grade ${g}">${g}</button>`).join("")}
      </div></div></div>`;
    document.body.prepend(top);
    top.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => {
      const g = +b.dataset.g;
      top.querySelectorAll("[data-g]").forEach(x => x.setAttribute("aria-pressed", String(+x.dataset.g === g)));
      F.setGrade(g);
      if (onGrade) onGrade(g);
    }));
    const foot = document.createElement("footer");
    foot.className = "foot";
    foot.innerHTML = `<span>Built for personal practice alongside JustinGuitar's free lessons. Audio never leaves your browser.</span>
      <a href="https://claude.ai/artifact/UxnD5gaehyATeUWixntR8b" target="_blank" rel="noopener">Open Fretlog ↗</a>
      <a href="https://www.justinguitar.com/" target="_blank" rel="noopener">justinguitar.com ↗</a>`;
    document.body.append(foot);
  };

  // ---------- exercises / lessons ----------
  F.lessonHref = slug => "learn.html#" + encodeURIComponent(slug);
  F.lessonTitle = slug => (LS.BY_SLUG[slug] || {}).title || slug;
  // Exercise from the URL hash "#<id>" or "#<id>/<extra>". Returns {ex, extra} or null.
  F.exerciseFromHash = function (engine) {
    const h = decodeURIComponent(location.hash.slice(1));
    const [id, ...rest] = h.split("/");
    const ex = EX.byId(id);
    if (ex && ex.engine === engine) return { ex, extra: rest.join("/") };
    return null;
  };
  F.firstExercise = (engine, grade) => EX.EXERCISES.find(e => e.engine === engine && e.grade === grade) || EX.EXERCISES.find(e => e.engine === engine);
  F.exerciseIntro = function (el, ex) {
    const lessons = ex.justinLessons.map(s => `<a href="${F.lessonHref(s)}">${F.esc(F.lessonTitle(s))}</a>`).join("");
    el.innerHTML = `<p class="eyebrow">Grade ${ex.grade} · ${F.esc(EX.ENGINES[ex.engine].name)}</p>
      <h1>${F.esc(ex.title)}</h1><hr class="rule"><p>${F.esc(ex.blurb)}</p>
      ${lessons ? `<div class="card-lessons row small"><span class="muted">Supports:</span>${lessons}</div>` : ""}`;
  };

  // ---------- chord diagrams ----------
  F.chordLabel = CH.label;
  F.chordSVG = function (name) {
    const f = CH.CHORDS[name];
    if (!f) return "";
    const fretted = f.filter(v => v > 0), lowF = fretted.length ? Math.min(...fretted) : 1, highF = fretted.length ? Math.max(...fretted) : 1;
    const base = highF > 4 ? lowF : 1, rows = 4;
    const W = 120, H = 156, x0 = 22, y0 = 44, sw = 15.2, fh = 24;
    const lab = F.esc(CH.label(name));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${lab} chord diagram">`;
    s += `<rect class="ring" x="2" y="2" width="${W - 4}" height="${H - 4}" rx="8"/>`;
    s += `<text x="${W / 2}" y="22" text-anchor="middle" fill="currentColor" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="800" font-size="20">${lab}</text>`;
    if (base === 1) s += `<rect x="${x0}" y="${y0 - 4}" width="${sw * 5}" height="4" fill="currentColor"/>`;
    else s += `<text x="${x0 - 6}" y="${y0 + fh * .65}" text-anchor="end" fill="#8a8a84" font-size="10" font-family="IBM Plex Mono, monospace">${base}fr</text>`;
    for (let i = 0; i < 6; i++) s += `<line x1="${x0 + i * sw}" y1="${y0}" x2="${x0 + i * sw}" y2="${y0 + fh * rows}" stroke="#8a8a84" stroke-width="1.2"/>`;
    for (let j = 1; j <= rows; j++) s += `<line x1="${x0}" y1="${y0 + j * fh}" x2="${x0 + sw * 5}" y2="${y0 + j * fh}" stroke="#3a3a3a" stroke-width="1.5"/>`;
    const b = CH.BARRE[name];
    if (b) { const y = y0 + (b.fret - base + .5) * fh; s += `<rect x="${x0 + b.from * sw - 6}" y="${y - 6}" width="${(b.to - b.from) * sw + 12}" height="12" rx="6" fill="#d0142c"/>`; }
    f.forEach((v, i) => {
      const x = x0 + i * sw;
      if (v < 0) s += `<text x="${x}" y="${y0 - 10}" text-anchor="middle" fill="#8a8a84" font-size="12" font-family="IBM Plex Mono, monospace">×</text>`;
      else if (v === 0) s += `<circle cx="${x}" cy="${y0 - 14}" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
      else if (!(b && v === b.fret && i >= b.from && i <= b.to)) s += `<circle cx="${x}" cy="${y0 + (v - base + .5) * fh}" r="6.5" fill="#d0142c"/>`;
    });
    return s + "</svg>";
  };

  // ---------- small helpers ----------
  F.sparkline = function (vals, opts) {
    const o = opts || {}, w = 120, h = 32, pad = 3;
    if (!vals.length) return "";
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const pts = vals.map((v, i) => [vals.length === 1 ? w / 2 : pad + i * (w - 2 * pad) / (vals.length - 1), h - pad - (v - lo) / span * (h - 2 * pad)]);
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${o.color || "#8a8a84"}" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="#f5c518"/></svg>`;
  };

  F.copy = async function (text, fallbackHost) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    if (fallbackHost) {
      fallbackHost.innerHTML = `<label class="field">Copy this:<textarea rows="2" readonly>${F.esc(text)}</textarea></label>`;
      const ta = fallbackHost.querySelector("textarea"); ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    }
    return false;
  };

  // Click once → button asks "Sure?"; second click within 4 s confirms. No confirm() dialogs.
  F.inlineConfirm = function (btn, onYes) {
    const orig = btn.textContent;
    btn.addEventListener("click", () => {
      if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = orig; clearTimeout(btn._t); onYes(); return; }
      btn.dataset.armed = "1"; btn.textContent = "Tap again to confirm";
      btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = orig; }, 4000);
    });
  };

  let lock = null, wantLock = false;
  F.wake = {
    async on() { wantLock = true; try { lock = await navigator.wakeLock.request("screen"); } catch (e) { lock = null; } },
    async off() { wantLock = false; try { if (lock) await lock.release(); } catch (e) { /* ignore */ } lock = null; },
  };
  document.addEventListener("visibilitychange", () => { if (wantLock && document.visibilityState === "visible") F.wake.on(); });

  F.fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ---------- history ----------
  // Records: {t, group, score, text, ...}. Best = max score (or min for lowerBetter engines).
  const LOWER_BETTER = { follow: true };
  F.history = function (exId) {
    const key = "hist." + exId;
    return {
      list() { const a = F.store.get(key, []); return Array.isArray(a) ? a.filter(r => r && typeof r === "object" && Number.isFinite(r.score)) : []; },
      add(rec) { const a = this.list(); a.push(Object.assign({ t: Date.now() }, rec)); F.store.set(key, a.slice(-300)); },
      clear() { F.store.del(key); },
    };
  };
  F.bestOf = function (ex, recs) {
    if (!recs.length) return null;
    const lb = LOWER_BETTER[ex.engine];
    return recs.reduce((b, r) => (lb ? r.score < b.score : r.score > b.score) ? r : b);
  };
  // Renders best + sparkline per group, recent runs, and a clear button.
  F.renderHistory = function (el, ex, opts) {
    const o = opts || {}, h = F.history(ex.id), recs = h.list();
    if (!recs.length) { el.innerHTML = `<p class="empty">No runs yet. Your results are kept in this browser only.</p>`; return; }
    const groups = {};
    recs.forEach(r => (groups[r.group || "—"] = groups[r.group || "—"] || []).push(r));
    const fmt = o.fmt || (r => String(r.score));
    el.innerHTML = `<div class="hist-groups">${Object.entries(groups).map(([g, rs]) => {
      const b = F.bestOf(ex, rs);
      return `<div class="hist-group"><span class="eyebrow">${F.esc(g)} · best</span><b>${F.esc(fmt(b))}</b>${F.sparkline(rs.slice(-20).map(r => LOWER_BETTER[ex.engine] ? -r.score : r.score))}<span class="small muted">${rs.length} run${rs.length > 1 ? "s" : ""}</span></div>`;
    }).join("")}</div>
      <ul class="hist-list">${recs.slice(-12).reverse().map(r => `<li><span>${F.fmtDate(r.t)} · ${F.esc(r.group || "")}</span><span>${F.esc(r.text || fmt(r))}</span></li>`).join("")}</ul>
      <div class="row"><button type="button" class="btn ghost sm" data-clear>Clear history</button></div>`;
    F.inlineConfirm(el.querySelector("[data-clear]"), () => { h.clear(); F.renderHistory(el, ex, o); if (o.onClear) o.onClear(); });
  };

  // ---------- microphone ----------
  // One shared input chain per page: source → analyser (8192, spectra) and → analyserT (2048, pitch).
  // tick listeners get {t (ms, ctx clock), rms, mag?, time?} every HOP_MS.
  function Mic() {
    this.ctx = null; this.stream = null; this.src = null; this.an = null; this.anT = null;
    this.floor = 0.003; this.noise = 0.001; this.gateMul = +F.store.get("gate", 1) || 1;
    this.k = +F.store.get("sens.k", D.C.SENSITIVITY_K) || D.C.SENSITIVITY_K;
    this.deviceKey = "default"; this.listeners = new Set(); this.timer = null; this.measuring = null;
    this.needSpectrum = false; this.needTime = false;
  }
  Mic.prototype.supported = function () {
    if (!window.isSecureContext) return "insecure";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";
    if (!(window.AudioContext || window.webkitAudioContext)) return "unsupported";
    return "ok";
  };
  Mic.prototype.enable = async function (deviceId) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = this.ctx;
    ctx.resume && ctx.resume();
    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? Object.assign({ deviceId: { exact: deviceId } }, base) : base });
    } catch (e) {
      if (deviceId && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) stream = await navigator.mediaDevices.getUserMedia({ audio: base });
      else throw e;
    }
    this.disconnect();
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : {};
    this.deviceId = settings.deviceId || deviceId || "";
    this.deviceLabel = (track && track.label) || "Microphone";
    this.deviceKey = this.deviceLabel || this.deviceId || "default";
    if (this.deviceId) F.store.set("device", this.deviceId);
    this.src = ctx.createMediaStreamSource(stream);
    this.an = ctx.createAnalyser(); this.an.fftSize = D.C.FFT_SIZE; this.an.smoothingTimeConstant = 0;
    this.anT = ctx.createAnalyser(); this.anT.fftSize = 2048; this.anT.smoothingTimeConstant = 0;
    this.src.connect(this.an); this.src.connect(this.anT);
    this.db = new Float32Array(this.an.frequencyBinCount); this.mag = new Float32Array(this.an.frequencyBinCount);
    this.td = new Float32Array(this.an.fftSize); this.tdT = new Float32Array(this.anT.fftSize);
    if (this.onsetNode) this.src.connect(this.lp);
    await ctx.resume();
    this.startLoop();
    await this.measureNoise(1000);
    return this;
  };
  Mic.prototype.disconnect = function () {
    try { if (this.src) this.src.disconnect(); } catch (e) { /* ignore */ }
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.src = null;
  };
  Mic.prototype.devices = async function () {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput"); } catch (e) { return []; }
  };
  Mic.prototype.startLoop = function () {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), D.C.HOP_MS);
  };
  Mic.prototype.tick = function () {
    if (!this.an) return;
    this.an.getFloatTimeDomainData(this.td);
    const rms = D.rms(this.td.subarray(this.td.length - 1024));
    const frame = { t: this.ctx.currentTime * 1000, rms, sampleRate: this.ctx.sampleRate, fftSize: this.an.fftSize };
    if (this.measuring) this.measuring.push(rms);
    if (this.needSpectrum) { this.an.getFloatFrequencyData(this.db); frame.mag = D.dbToMag(this.db, this.mag); }
    if (this.needTime) { this.anT.getFloatTimeDomainData(this.tdT); frame.time = this.tdT; }
    this.listeners.forEach(fn => { try { fn(frame); } catch (e) { console.error(e); } });
  };
  Mic.prototype.on = function (fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  Mic.prototype.measureNoise = function (ms) {
    this.measuring = [];
    return new Promise(res => setTimeout(() => {
      const a = this.measuring.slice().sort((x, y) => x - y); this.measuring = null;
      this.noise = a.length ? a[a.length >> 1] : 0.001;
      this.updateFloor(); res(this.noise);
    }, ms));
  };
  Mic.prototype.updateFloor = function () { this.floor = Math.max(0.001, this.noise * 2.5) * this.gateMul; };
  // Sample-accurate onsets for timing: lowpass (keeps a high metronome click out) → AudioWorklet energy envelope.
  Mic.prototype.envelopeStream = async function (fn) {
    const ctx = this.ctx;
    if (!this.onsetNode) {
      await ctx.audioWorklet.addModule("env-worklet.js");
      this.lp = ctx.createBiquadFilter(); this.lp.type = "lowpass"; this.lp.frequency.value = D.C.TIMING_LOWPASS_HZ; this.lp.Q.value = 0.707;
      this.onsetNode = new AudioWorkletNode(ctx, "env-proc", { processorOptions: { hop: D.C.ENV_HOP } });
      const sink = ctx.createGain(); sink.gain.value = 0;
      this.lp.connect(this.onsetNode); this.onsetNode.connect(sink); sink.connect(ctx.destination);
      if (this.src) this.src.connect(this.lp);
    }
    this.onsetNode.port.onmessage = ev => fn(ev.data);
  };
  F.Mic = Mic;

  // Mic panel UI. opts: {sensitivity: bool, onReady(mic), onDevice(mic)}
  F.micPanel = function (el, mic, opts) {
    const o = opts || {};
    el.innerHTML = `
      <div class="row"><button type="button" class="btn red" data-en>Enable microphone</button>
        <label class="field" data-devwrap hidden style="flex:1;min-width:200px">Input device<select data-dev></select></label></div>
      <div><div class="meter" aria-hidden="true"><i data-lvl></i><b data-gate></b></div>
        <p class="small muted mono" data-status aria-live="polite">Microphone is off.</p></div>
      <details><summary class="small">Input tuning</summary><div class="mic-grid" style="margin-top:10px">
        <label class="field">Noise gate <span class="mono" data-gatev></span><input type="range" min="0.5" max="4" step="0.1" data-gatein></label>
        ${o.sensitivity ? `<label class="field">Onset sensitivity <span class="mono" data-sensv></span><input type="range" min="0" max="100" step="1" data-sens></label>` : ""}
        <div class="row"><button type="button" class="btn sm" data-remeasure disabled>Re-measure room noise</button></div>
      </div></details>
      <div data-err></div>`;
    const $ = s => el.querySelector(s);
    const status = $("[data-status]"), err = $("[data-err]"), lvl = $("[data-lvl]"), gate = $("[data-gate]");
    const toPct = r => Math.max(0, Math.min(100, (20 * Math.log10(Math.max(r, 1e-6)) + 60) / 60 * 100)); // -60..0 dBFS
    const dbfs = r => (20 * Math.log10(Math.max(r, 1e-6))).toFixed(0) + " dBFS";
    const gin = $("[data-gatein]"); gin.value = mic.gateMul; $("[data-gatev]").textContent = "×" + mic.gateMul.toFixed(1);
    gin.addEventListener("input", () => { mic.gateMul = +gin.value; F.store.set("gate", mic.gateMul); mic.updateFloor(); $("[data-gatev]").textContent = "×" + mic.gateMul.toFixed(1); paintGate(); });
    const sens = $("[data-sens]");
    if (sens) {
      const kToS = k => Math.round((4 - k) / 2.5 * 100), sToK = s => 4 - s / 100 * 2.5;
      sens.value = kToS(mic.k); $("[data-sensv]").textContent = sens.value;
      sens.addEventListener("input", () => { mic.k = sToK(+sens.value); F.store.set("sens.k", mic.k); $("[data-sensv]").textContent = sens.value; if (o.onSensitivity) o.onSensitivity(mic.k); });
    }
    const paintGate = () => { gate.style.left = toPct(mic.floor) + "%"; };
    const showErr = msg => { err.innerHTML = msg ? `<p class="note err">${msg}</p>` : ""; };
    const sup = mic.supported();
    if (sup === "insecure") showErr("The microphone only works over https or on localhost. Open this page from its https:// address.");
    else if (sup === "unsupported") showErr("This browser doesn't support microphone input (getUserMedia / Web Audio). Try current Chrome or Safari.");
    if (sup !== "ok") $("[data-en]").disabled = true;
    mic.on(f => { lvl.style.width = toPct(f.rms) + "%"; lvl.classList.toggle("hot", f.rms > mic.floor); });
    async function fillDevices() {
      const list = await mic.devices(), sel = $("[data-dev]");
      sel.innerHTML = list.map((d, i) => `<option value="${F.esc(d.deviceId)}">${F.esc(d.label || "Input " + (i + 1))}</option>`).join("");
      sel.value = mic.deviceId; if (sel.value !== mic.deviceId && list[0]) sel.value = list[0].deviceId;
      $("[data-devwrap]").hidden = !list.length;
    }
    async function start(id) {
      showErr(""); status.textContent = "Asking for microphone…";
      try {
        const p = mic.enable(id);
        setTimeout(() => { if (mic.measuring) status.textContent = "Measuring room noise — stay quiet for a second…"; }, 50);
        await p;
        status.textContent = `${mic.deviceLabel} · ${Math.round(mic.ctx.sampleRate / 100) / 10} kHz · noise ${dbfs(mic.noise)} · gate ${dbfs(mic.floor)}`;
        paintGate(); $("[data-en]").textContent = "Microphone on"; $("[data-en]").disabled = true; $("[data-remeasure]").disabled = false;
        await fillDevices();
        if (o.onReady) o.onReady(mic);
      } catch (e) {
        status.textContent = "Microphone is off.";
        const n = e && e.name;
        if (n === "NotAllowedError" || n === "SecurityError") showErr("Microphone permission was denied. Allow it in the browser's site settings (the icon left of the address bar), then reload.");
        else if (n === "NotFoundError") showErr("No microphone found. Plug in your amp's USB cable or a mic, then try again.");
        else if (n === "NotReadableError") showErr("The microphone is busy or blocked by another app. Close it there and try again.");
        else showErr("Couldn't start the microphone: " + F.esc((e && e.message) || n || "unknown error"));
      }
    }
    $("[data-en]").addEventListener("click", () => start(F.store.get("device", "")));
    $("[data-dev]").addEventListener("change", e => start(e.target.value));
    $("[data-remeasure]").addEventListener("click", async () => { status.textContent = "Measuring room noise — stay quiet…"; await mic.measureNoise(1000); status.textContent = `${mic.deviceLabel} · noise ${dbfs(mic.noise)} · gate ${dbfs(mic.floor)}`; paintGate(); });
    return { status: t => { status.textContent = t; } };
  };
})();
