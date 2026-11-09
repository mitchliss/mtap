// The studio object handed to part modules, and the chunked Stem write target.
import { SR, Rng, panGains, balanceGains, dbToGain } from './core/util.js';

export const CHUNK = 1 << 15; // 32768 frames (~0.74 s) per lazily-allocated chunk

/** Normalise an instrument render result to { L, R, offset, mono } */
export function asStereo(res) {
  if (!res) return null;
  if (res instanceof Float32Array) return { L: res, R: res, offset: 0, mono: true };
  if (Array.isArray(res)) return { L: res[0], R: res[1] || res[0], offset: 0, mono: !res[1] || res[1] === res[0] };
  if (res.L) return { L: res.L, R: res.R || res.L, offset: res.offset || 0, mono: !res.R || res.R === res.L };
  if (res.data) return asStereo(res.data);
  throw new Error('instrument render must return Float32Array, [L, R] or { L, R, offset }');
}

/**
 * A stereo write target. Audio is stored in lazily allocated chunks, so sparse stems cost little memory.
 * Times are seconds from song start (t = 0 is the first downbeat of the first section).
 */
export class Stem {
  constructor(name, studio) {
    this.name = name; this.studio = studio; this.sr = studio.sr;
    this.chunks = []; // index -> [Float32Array L, Float32Array R]
    this.events = []; this.dropped = 0; this.renderMs = 0;
  }
  _chunk(ci) {
    let c = this.chunks[ci];
    if (!c) { c = [new Float32Array(CHUNK), new Float32Array(CHUNK)]; this.chunks[ci] = c; }
    return c;
  }
  /** add raw frames: L/R arrays at absolute frame, with per-channel gains */
  addFrames(frame, L, R, gL = 1, gR = 1) {
    const n = L.length;
    const r = this.studio.rangeFrames;
    let i0 = 0, i1 = n;
    if (frame < r[0]) i0 = r[0] - frame;
    if (frame + n > r[1]) i1 = r[1] - frame;
    if (i1 <= i0) { this.dropped++; return; }
    let i = i0;
    while (i < i1) {
      const f = frame + i, ci = Math.floor(f / CHUNK), off = f - ci * CHUNK;
      const m = Math.min(i1 - i, CHUNK - off);
      const [cL, cR] = this._chunk(ci);
      for (let k = 0; k < m; k++) { cL[off + k] += L[i + k] * gL; cR[off + k] += R[i + k] * gR; }
      i += m;
    }
  }
  /**
   * Mix audio in at `time` (seconds). data: Float32Array (mono) | [L, R] | { L, R, offset }.
   * opts: { gain (linear)=1, db, pan=-1..1 (equal-power for mono, balance for stereo) }
   */
  add(time, data, opts = {}) {
    const s = asStereo(data); if (!s) return;
    const g = (opts.gain ?? 1) * (opts.db !== undefined ? dbToGain(opts.db) : 1);
    const pan = opts.pan ?? 0;
    let gl, gr;
    if (s.mono) { [gl, gr] = panGains(pan); } else { [gl, gr] = balanceGains(pan); }
    this.addFrames(Math.round((time + s.offset) * this.sr), s.L, s.R, gl * g, gr * g);
  }
  /**
   * Render a note with an instrument and mix it in; the note is logged for the piano roll.
   * note: { time, midi, vel, dur, pan, gain, db, ...instrument fields }. Returns the instrument's raw result (or null if skipped).
   */
  play(inst, note) {
    const st = this.studio;
    const tail = inst.tail ?? 1;
    const t0 = note.time - 1, t1 = note.time + (note.dur ?? 0) + tail + 0.5;
    this.events.push({ stem: this.name, time: note.time, dur: note.dur ?? 0.1, midi: note.midi ?? inst.midi ?? 60, vel: note.vel ?? 0.8, inst: inst.name || 'inst' });
    st._autoTrigger(this.name, note.time);
    if (t1 < st.range.start || t0 > st.range.end) return null;
    const c0 = performance.now();
    let res;
    const useCache = inst.opts?.cache || note.cache;
    if (useCache) {
      let m = st._cache.get(inst); if (!m) { m = new Map(); st._cache.set(inst, m); }
      const key = JSON.stringify({ ...note, time: 0, pan: 0, gain: 0, db: 0 });
      res = m.get(key);
      if (!res) { res = inst.render(note); m.set(key, res); }
    } else res = inst.render(note);
    this.renderMs += performance.now() - c0;
    this.add(note.time, res, note);
    return res;
  }
  /** read frames [frame, frame+n) into outL/outR (zeros where nothing was written) */
  read(frame, n, outL, outR) {
    let i = 0;
    while (i < n) {
      const f = frame + i, ci = Math.floor(f / CHUNK), off = f - ci * CHUNK, m = Math.min(n - i, CHUNK - off);
      const c = f >= 0 ? this.chunks[ci] : null;
      if (c) { outL.set(c[0].subarray(off, off + m), i); outR.set(c[1].subarray(off, off + m), i); }
      else { outL.fill(0, i, i + m); outR.fill(0, i, i + m); }
      i += m;
    }
  }
  /** true if any chunk overlapping [frame, frame+n) exists */
  hasData(frame, n) {
    const a = Math.floor(Math.max(0, frame) / CHUNK), b = Math.floor(Math.max(0, frame + n - 1) / CHUNK);
    for (let ci = a; ci <= b; ci++) if (this.chunks[ci]) return true;
    return false;
  }
  get bytes() { let n = 0; for (const c of this.chunks) if (c) n += CHUNK * 8; return n; }
}

/** cue silence windows: cues.silenceBeats = { sectionName: beats } -> the last `beats` beats of each such section */
export function silenceWindows(cues, sections, timeline) {
  const out = [];
  const sb = cues && cues.silenceBeats;
  if (!sb || typeof sb !== 'object') return out;
  for (const [name, beats] of Object.entries(sb)) {
    const s = sections.find((x) => x.name === name);
    if (!s || !(beats > 0)) continue;
    out.push({ section: name, beats, start: timeline.beatToSec(s.endBeat - beats), end: s.end });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Build the studio object for part modules.
 * ctx: { score, cues, resolved: { sections, timeline, melodyNotes, chords }, engine, sr, range: {start, end} (s), fast, songDir, tail }
 */
export function createStudio(ctx) {
  const { score, resolved, engine } = ctx;
  const sr = ctx.sr || SR;
  const { sections, timeline, melodyNotes, chords } = resolved;
  const songEnd = sections[sections.length - 1].end;
  const range = ctx.range || { start: 0, end: songEnd + (ctx.tail ?? 8) };
  const stems = new Map();
  const triggers = new Map();
  const autoTriggers = new Map();
  const cues = ctx.cues || score.cues || {};
  const silences = silenceWindows(cues, sections, timeline);
  const studio = {
    sr, fast: !!ctx.fast, score, cues, silences, title: score.title || 'untitled', key: score.key || '',
    sections, timeline, melodyNotes, chords, engine, songEnd, duration: songEnd, range,
    rangeFrames: [Math.max(0, Math.floor(range.start * sr)), Math.ceil(range.end * sr)],
    stems, triggers, logs: [], _cache: new Map(), partName: null,
    /** section by name (throws if missing) */
    section(name) { const s = sections.find((x) => x.name === name); if (!s) throw new Error(`no section "${name}"`); return s; },
    /** section containing time t (or null) */
    sectionAt(t) { return sections.find((s) => t >= s.start && t < s.end) || null; },
    /** sections with a given role ('drop', 'build', ...) */
    sectionsByRole(role) { return sections.filter((s) => s.role === role); },
    /** seconds of a global bar (+beat) position */
    t(bar, beat = 0) { return timeline.beatToSec(bar * 4 + beat); },
    /** melody notes in a section (name) or all */
    melody(name) { return name ? melodyNotes.filter((n) => n.section === name) : melodyNotes; },
    /** chord active at time t */
    chordAt(t) { for (const c of chords) if (t >= c.start && t < c.end) return c; return t < 0 ? chords[0] : chords[chords.length - 1]; },
    /** chords (half-bar objects) in a section */
    chordsIn(name) { return chords.filter((c) => c.section === name); },
    /** get or create a stem */
    stem(name) {
      if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error(`stem name "${name}" must be [a-z0-9_-]`);
      let s = stems.get(name);
      if (!s) { s = new Stem(name, studio); s.part = studio.partName; stems.set(name, s); }
      return s;
    },
    /** shortcut: studio.play('keys', inst, note) */
    play(stemName, inst, note) { return studio.stem(stemName).play(inst, note); },
    /** seeded RNG (seed is namespaced by the current part so parts don't share streams by accident) */
    rng(seed = 1) { return new Rng(`${studio.partName || ''}:${seed}`); },
    /** log a note event for the piano roll: { stem, time, dur, midi, vel } (stem.play logs automatically) */
    log(ev) { studio.logs.push({ dur: 0.1, vel: 0.8, midi: 60, ...ev }); },
    /** record a sidechain trigger time (seconds) in a named list, e.g. studio.trigger('kick', t) */
    trigger(name, time) { let a = triggers.get(name); if (!a) { a = []; triggers.set(name, a); } a.push(time); },
    /** trigger times for a name: explicit studio.trigger() list, else the note times played on the stem of that name */
    triggerTimes(name) { const a = triggers.get(name) || autoTriggers.get(name) || []; return a.slice().sort((x, y) => x - y); },
    /** true if time t (or the span [t, t1]) touches a cue silence window (cues.silenceBeats) */
    inSilence(t, t1 = t) { return silences.some((z) => t1 > z.start - 1e-6 && t < z.end - 1e-6); },
    /** true if [t0, t1] overlaps the render range (use to skip expensive work with --from/--to) */
    inRange(t0, t1 = t0) { return t1 >= range.start && t0 <= range.end; },
    _autoTrigger(stemName, time) { let a = autoTriggers.get(stemName); if (!a) { a = []; autoTriggers.set(stemName, a); } a.push(time); },
    allEvents() { const ev = [...studio.logs]; for (const s of stems.values()) ev.push(...s.events); return ev.sort((a, b) => a.time - b.time); },
    /** (engine) everything a part produced, as transferable data: { stems, triggers, autoTriggers, logs } */
    _mark() { return { t: new Map([...triggers].map(([k, v]) => [k, v.length])), a: new Map([...autoTriggers].map(([k, v]) => [k, v.length])), l: studio.logs.length }; },
    _export(partName, since = null) {
      const cut = (m, mk) => [...m].map(([k, v]) => [k, since ? v.slice(mk.get(k) || 0) : v]).filter(([, v]) => v.length);
      const out = { stems: [], triggers: cut(triggers, since?.t), autoTriggers: cut(autoTriggers, since?.a), logs: since ? studio.logs.slice(since.l) : studio.logs }, transfer = [];
      for (const st of stems.values()) {
        if (partName && st.part !== partName) continue;
        const chunks = [];
        st.chunks.forEach((c, ci) => { if (c) { chunks.push([ci, c[0], c[1]]); transfer.push(c[0].buffer, c[1].buffer); } });
        out.stems.push({ name: st.name, part: st.part, chunks, events: st.events, dropped: st.dropped, renderMs: st.renderMs });
      }
      return { data: out, transfer };
    },
    /** (engine) merge another studio's export (worker result or dependency info); audio chunks are summed */
    _absorb(d, { audio = true } = {}) {
      for (const [k, v] of d.triggers || []) { let a = triggers.get(k); if (!a) { a = []; triggers.set(k, a); } a.push(...v); }
      for (const [k, v] of d.autoTriggers || []) { let a = autoTriggers.get(k); if (!a) { a = []; autoTriggers.set(k, a); } a.push(...v); }
      if (d.logs) studio.logs.push(...d.logs);
      for (const x of d.stems || []) {
        let st = stems.get(x.name);
        if (!st) { st = new Stem(x.name, studio); st.part = x.part; stems.set(x.name, st); }
        else if (st.part !== x.part && !String(st.part).split('+').includes(x.part)) st.part = st.part + '+' + x.part;
        st.events.push(...x.events); st.dropped += x.dropped || 0; st.renderMs += x.renderMs || 0;
        if (!audio) continue;
        for (const [ci, L, R] of x.chunks || []) {
          const c = st.chunks[ci];
          if (!c) st.chunks[ci] = [L, R];
          else { const a = c[0], b = c[1]; for (let i = 0; i < L.length; i++) { a[i] += L[i]; b[i] += R[i]; } }
        }
      }
    },
  };
  return studio;
}
