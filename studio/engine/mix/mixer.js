// Mixer: stems -> channel strips -> buses / FX returns (sends) -> master bus. Block based (256 frames).
// Collects per-section statistics for the report (RMS, peak, band energy per stem, compressor GR, time series).
import { dbToGain } from '../core/util.js';
import { createFx, AutoFilter, Widener, Ducker } from '../fx/index.js';
import { powerSpectrum } from '../core/fft.js';

export const BLOCK = 256;
export const BANDS = [['sub', 0, 60], ['low', 60, 250], ['lowmid', 250, 800], ['mid', 800, 3000], ['presence', 3000, 8000], ['air', 8000, 22050]];
const FFT_N = 2048, FFT_HOP = 8192, SERIES_HOP = 2205; // 50 ms time-series resolution

/** position -> seconds. number | 'section' | 'section>' (end) | 'section@0.5' (fraction) | 'section+2' (bars) | {section, at|bar} */
export function posToSec(pos, studio) {
  if (typeof pos === 'number') return pos;
  if (pos && typeof pos === 'object') { const s = studio.section(pos.section); return pos.bar !== undefined ? s.at(pos.bar) : s.start + (pos.at ?? 0) * s.dur; }
  const m = /^([A-Za-z0-9_-]+?)(?:(@)([\d.]+)|(\+)([\d.]+)|(>))?$/.exec(String(pos));
  if (!m) throw new Error(`bad automation position "${pos}"`);
  const s = studio.section(m[1]);
  if (m[2]) return s.start + parseFloat(m[3]) * s.dur;
  if (m[4]) return s.at(parseFloat(m[5]));
  if (m[6]) return s.end;
  return s.start;
}

/** compile [[pos, value], ...] into a lane. logScale: interpolate in log domain (frequencies). */
function compileLane(points, studio, logScale) {
  const pts = points.map(([p, v]) => [posToSec(p, studio) * studio.sr, v]).sort((a, b) => a[0] - b[0]);
  return { f: Float64Array.from(pts.map((p) => p[0])), v: Float64Array.from(pts.map((p) => (logScale ? Math.log(p[1]) : p[1]))), log: logScale, i: 0 };
}
function laneAt(lane, frame) {
  const f = lane.f, v = lane.v;
  if (frame <= f[0]) return lane.log ? Math.exp(v[0]) : v[0];
  if (frame >= f[f.length - 1]) return lane.log ? Math.exp(v[v.length - 1]) : v[v.length - 1];
  let i = lane.i;
  if (i >= f.length - 1 || f[i] > frame) i = 0;
  while (i < f.length - 2 && f[i + 1] <= frame) i++;
  lane.i = i;
  const x = (frame - f[i]) / Math.max(1e-9, f[i + 1] - f[i]);
  const y = v[i] + (v[i + 1] - v[i]) * x;
  return lane.log ? Math.exp(y) : y;
}

function shorthandInserts(cfg) {
  const out = [];
  if (cfg.eq) out.push({ type: 'eq', bands: cfg.eq });
  if (cfg.sat) out.push({ type: 'sat', ...cfg.sat });
  if (cfg.comp) out.push({ type: 'comp', ...cfg.comp });
  if (cfg.glue) out.push({ type: 'comp', ...cfg.glue });
  return out;
}

class Strip {
  constructor(name, kind, cfg, ctx) {
    this.name = name; this.kind = kind; this.cfg = cfg; const studio = ctx.studio;
    this.trim = dbToGain(cfg.trim ?? 0);
    this.mute = !!cfg.mute;
    this.out = kind === 'master' ? null : cfg.out || cfg.bus || ctx.defaultBus;
    this.head = null;
    if (kind === 'return') {
      const { gain, pan, width, eq, comp, sat, inserts, sends, duck, auto, out, bus, mute, trim, filter, ...fxCfg } = cfg;
      void gain; void pan; void width; void eq; void comp; void sat; void inserts; void sends; void duck; void auto; void out; void bus; void mute; void trim; void filter;
      this.head = createFx({ mix: 1, ...fxCfg, type: cfg.type || 'reverb' }, ctx.fxCtx);
    }
    const auto = cfg.auto || {};
    this.lanes = {};
    for (const [k, pts] of Object.entries(auto)) this.lanes[k] = compileLane(pts, studio, k === 'hp' || k === 'lp');
    const filt = cfg.filter || {};
    this.hp = filt.hp !== undefined || this.lanes.hp ? new AutoFilter({ type: 'hp', freq: filt.hp ?? 10, q: filt.q ?? 0.7071, slope: filt.slope ?? 24 }, ctx.sr) : null;
    this.lp = filt.lp !== undefined || this.lanes.lp ? new AutoFilter({ type: 'lp', freq: filt.lp ?? 30000, q: filt.q ?? 0.7071, slope: filt.slope ?? 24 }, ctx.sr) : null;
    if (this.hp) this.hp.setFreq(filt.hp ?? 10); if (this.lp) this.lp.setFreq(filt.lp ?? 30000);
    const ins = cfg.inserts || shorthandInserts(cfg);
    this.inserts = ins.map((c) => {
      const fx = createFx(c, ctx.fxCtx);
      fx._cfg = c; fx._key = c.key || c.sidechain || null;
      return fx;
    });
    this.width = cfg.width ?? 1;
    this.widener = this.width !== 1 || cfg.bassMono || this.lanes.width ? new Widener({ width: this.width, bassMono: cfg.bassMono || 0 }, ctx.sr) : null;
    this.pan = cfg.pan ?? 0;
    this.gainDb = cfg.gain ?? 0;
    this.ducker = null;
    if (cfg.duck) {
      const d = cfg.duck;
      let times = Array.isArray(d.trigger) ? d.trigger.slice() : studio.triggerTimes(d.trigger || 'kick');
      if (d.sections) { const secs = d.sections.map((s) => studio.section(s)); times = times.filter((t) => secs.some((s) => t >= s.start - 1e-6 && t < s.end)); }
      if (d.from !== undefined) times = times.filter((t) => t >= posToSec(d.from, studio) - 1e-6);
      if (d.to !== undefined) times = times.filter((t) => t < posToSec(d.to, studio));
      const rel = d.release ?? 0.2;
      const relFn = typeof rel === 'string' ? (t) => studio.timeline.noteLen(rel, t) : null;
      this.ducker = new Ducker({ ...d, times, release: relFn || rel }, ctx.sr);
      this.duckCount = times.length;
    }
    this.sends = Object.entries(cfg.sends || {}).map(([target, s]) => {
      const o = typeof s === 'number' ? { db: s } : s;
      return { target, db: o.db ?? o.gain ?? -12, pre: !!o.pre, lane: this.lanes[`send:${target}`] || null, g: dbToGain(o.db ?? o.gain ?? -12) };
    });
    const B = BLOCK;
    this.L = new Float32Array(B); this.R = new Float32Array(B);
    this.inL = new Float32Array(B); this.inR = new Float32Array(B);
    this.preL = this.sends.some((s) => s.pre) ? new Float32Array(B) : null; this.preR = this.preL ? new Float32Array(B) : null;
    this.lastPeak = 0; this.lastSumSq = 0; this.quietBlocks = 99999; this.gPrev = null; this.nanFixed = 0; this.msFx = 0; this.msOther = 0;
    // blocks of silence before a silent strip may be skipped: long for anything with a tail (delays/reverbs/returns)
    const tailFx = ['delay', 'reverb', 'chorus', 'ensemble', 'flanger', 'resonance'];
    this.tailBlocks = this.head || ins.some((c) => tailFx.includes(c.type)) ? 800 : 2;
    // stats
    const nS = ctx.nSections;
    this.st = { sumSq: new Float64Array(nS), peak: new Float64Array(nS), frames: new Float64Array(nS), active: new Float64Array(nS), bands: Array.from({ length: nS }, () => new Float64Array(BANDS.length)), gr: Array.from({ length: nS }, () => ({ sum: 0, max: 0, n: 0 })) };
    this.series = new Float32Array(ctx.seriesLen);
    this.ring = kind === 'stem' ? new Float32Array(FFT_N) : null; this.ringPos = 0; this.ringFill = 0; this.sinceFFT = 0;
  }
  /** process this.L/this.R in place (n frames, absolute frame0). Returns false if silent and skipped. */
  process(n, frame0, keyFor) {
    const L = this.L, R = this.R;
    if (this.head) this.head.process(L, R, 0, n, frame0);
    if (this.trim !== 1) for (let i = 0; i < n; i++) { L[i] *= this.trim; R[i] *= this.trim; }
    const mid = frame0 + n / 2;
    if (this.hp) { if (this.lanes.hp) this.hp.setFreq(laneAt(this.lanes.hp, mid)); this.hp.process(L, R, 0, n); }
    if (this.lp) { if (this.lanes.lp) this.lp.setFreq(laneAt(this.lanes.lp, mid)); this.lp.process(L, R, 0, n); }
    for (const fx of this.inserts) {
      if (fx._key && fx.setKey) { const k = keyFor(fx._key); if (k) fx.setKey(k[0], k[1]); }
      fx.process(L, R, 0, n, frame0);
    }
    if (this.widener) this.widener.process(L, R, 0, n, this.lanes.width ? laneAt(this.lanes.width, mid) : this.width);
    const pan = this.lanes.pan ? laneAt(this.lanes.pan, mid) : this.pan;
    if (pan !== 0) {
      const p = Math.max(-1, Math.min(1, pan)), gl = p > 0 ? Math.cos((p * Math.PI) / 2) : 1, gr = p < 0 ? Math.cos((-p * Math.PI) / 2) : 1;
      for (let i = 0; i < n; i++) { L[i] *= gl; R[i] *= gr; }
    }
    if (this.ducker) this.ducker.process(L, R, 0, n, frame0);
    if (this.preL) { this.preL.set(L.subarray(0, n)); this.preR.set(R.subarray(0, n)); }
    // fader with per-block ramp (automation), fused with NaN/Inf guard, peak and energy measurement
    const g1 = this.mute ? 0 : dbToGain(this.lanes.gain ? laneAt(this.lanes.gain, frame0 + n) : this.gainDb);
    const g0 = this.gPrev ?? g1, dg = (g1 - g0) / n;
    let pk = 0, ss = 0, bad = 0;
    for (let i = 0; i < n; i++) {
      const g = g0 + dg * i;
      let a = L[i] * g, b = R[i] * g;
      if (a - a !== 0) { a = 0; bad++; } // NaN or +-Inf
      if (b - b !== 0) { b = 0; bad++; }
      L[i] = a; R[i] = b;
      ss += a * a + b * b;
      if (a < 0) a = -a; if (b < 0) b = -b;
      if (a > pk) pk = a; if (b > pk) pk = b;
    }
    this.gPrev = g1; this.nanFixed += bad;
    this.lastPeak = pk; this.lastSumSq = ss; this.quietBlocks = pk < 1e-6 ? this.quietBlocks + 1 : 0;
    return true;
  }
  stats(n, sec, frameRel, sr) {
    const L = this.L, R = this.R, st = this.st;
    const s = this.lastSumSq, pk = this.lastPeak; // measured in process()
    st.sumSq[sec] += s; st.frames[sec] += n; if (pk > st.peak[sec]) st.peak[sec] = pk;
    if (s / (2 * n) > 1e-6) st.active[sec] += n; // > -60 dBFS
    const si = Math.floor(frameRel / SERIES_HOP); if (si < this.series.length) this.series[si] += s;
    for (const fx of this.inserts) {
      if (fx.stats && fx.stats.n !== undefined) {
        const prev = fx._prevStats || { grSum: 0, n: 0 };
        const dn = fx.stats.n - prev.n, dg = fx.stats.grSum - prev.grSum;
        const g = st.gr[sec]; g.sum += dg; g.n += dn; g.max = Math.max(g.max, fx.stats.grMax);
        fx._prevStats = { grSum: fx.stats.grSum, n: fx.stats.n };
      }
    }
    if (this.ring) {
      // band analysis: one 2048-pt spectrum every FFT_HOP frames; only the frames just before it are buffered
      this.sinceFFT += n;
      if (this.sinceFFT > FFT_HOP - FFT_N - BLOCK) {
        const ring = this.ring;
        let p = this.ringPos;
        for (let i = 0; i < n; i++) { ring[p] = (L[i] + R[i]) * 0.5; if (++p === FFT_N) p = 0; }
        this.ringPos = p; this.ringFill = Math.min(FFT_N, this.ringFill + n);
      }
      if (this.sinceFFT >= FFT_HOP && this.ringFill >= FFT_N) {
        this.sinceFFT = 0; this.ringFill = 0;
        const lin = Strip.lin || (Strip.lin = new Float32Array(FFT_N));
        let e = 0;
        const ring = this.ring;
        for (let i = 0, p = this.ringPos; i < FFT_N; i++) { const v = ring[p]; lin[i] = v; e += v * v; if (++p === FFT_N) p = 0; }
        if (e > 1e-7 * FFT_N) {
          const p = powerSpectrum(lin, 0, FFT_N, Strip.ps || (Strip.ps = new Float64Array(FFT_N / 2 + 1)), Strip.scr || (Strip.scr = { re: new Float64Array(FFT_N), im: new Float64Array(FFT_N) }));
          const b = st.bands[sec];
          const bb = Strip.binBand || (Strip.binBand = Int32Array.from({ length: FFT_N / 2 + 1 }, (_, k) => { const f = (k * sr) / FFT_N; let bi = 0; while (bi < BANDS.length - 1 && f >= BANDS[bi][2]) bi++; return bi; }));
          for (let k = 1; k < p.length; k++) b[bb[k]] += p[k];
        }
      }
    }
  }
}

/**
 * Mix all stems. mixCfg: { stems: {name|'*': strip}, buses: {name: strip}, returns: {name: {type, ...fx, ...strip}}, master: {...} }
 * Returns { L, R, stats: {...}, warnings: [] }
 */
export function mixdown(studio, mixCfg, opts = {}) {
  const sr = studio.sr, warnings = [];
  const [f0, f1] = studio.rangeFrames;
  const N = f1 - f0;
  const sections = studio.sections;
  const nSections = sections.length + 1; // + tail
  const secStartF = sections.map((s) => Math.round(s.start * sr));
  const secEndLast = Math.round(sections[sections.length - 1].end * sr);
  const secOf = (f) => { if (f >= secEndLast || f < secStartF[0]) return sections.length; let k = 0; while (k + 1 < secStartF.length && f >= secStartF[k + 1]) k++; return k; };
  const seriesLen = Math.ceil(N / SERIES_HOP) + 1;
  const fxCtx = { sr, timeline: studio.timeline, fast: studio.fast };
  const buses = mixCfg.buses || {}, returns = mixCfg.returns || {};
  const defaultBus = (mixCfg.stems && mixCfg.stems['*'] && mixCfg.stems['*'].bus) || (buses.music ? 'music' : 'master');
  const ctx = { studio, sr, fxCtx, nSections, seriesLen, defaultBus };
  // strips
  const stemStrips = [];
  const solo = [...studio.stems.keys()].some((k) => mixCfg.stems?.[k]?.solo);
  for (const [name, stem] of studio.stems) {
    const cfg = { ...(mixCfg.stems?.['*'] || {}), ...(mixCfg.stems?.[name] || {}) };
    if (!mixCfg.stems?.[name]) warnings.push(`stem "${name}" has no entry in mix.js; using defaults (bus ${cfg.bus || defaultBus})`);
    if (solo && !mixCfg.stems?.[name]?.solo) cfg.mute = true;
    const s = new Strip(name, 'stem', cfg, ctx); s.stem = stem;
    stemStrips.push(s);
  }
  for (const k of Object.keys(mixCfg.stems || {})) if (k !== '*' && !studio.stems.has(k)) warnings.push(`mix.js configures stem "${k}" but no part wrote it`);
  const nodes = new Map();
  for (const [name, cfg] of Object.entries(buses)) nodes.set(name, new Strip(name, 'bus', { out: 'master', ...cfg }, { ...ctx, defaultBus: 'master' }));
  for (const [name, cfg] of Object.entries(returns)) nodes.set(name, new Strip(name, 'return', { out: 'master', ...cfg }, { ...ctx, defaultBus: 'master' }));
  const master = new Strip('master', 'master', { ...(mixCfg.master || {}), sends: {} }, ctx);
  const target = (name, from) => {
    if (name === 'master') return master;
    const t = nodes.get(name);
    if (!t) throw new Error(`"${from}" routes to unknown bus/return "${name}"`);
    return t;
  };
  // topological order of nodes
  const order = [], state = new Map();
  const visit = (name, path) => {
    if (state.get(name) === 2) return;
    if (state.get(name) === 1) throw new Error(`routing cycle: ${[...path, name].join(' -> ')}`);
    state.set(name, 1);
    // a node must run after everything feeding it
    for (const [nm, nd] of nodes) if (nd.out === name || nd.sends.some((s) => s.target === name)) visit(nm, [...path, name]);
    state.set(name, 2); order.push(nodes.get(name));
  };
  for (const nm of nodes.keys()) visit(nm, []);
  for (const s of [...stemStrips, ...nodes.values()]) { target(s.out, s.name); for (const se of s.sends) { if (!returns[se.target] && !buses[se.target]) throw new Error(`"${s.name}" sends to unknown return "${se.target}"`); } }
  // output
  const outL = new Float32Array(N), outR = new Float32Array(N);
  const raw = new Map(stemStrips.map((s) => [s.name, [new Float32Array(BLOCK), new Float32Array(BLOCK)]]));
  const keyFor = (nm) => raw.get(nm) || null;
  let overs = 0;
  const allNodes = [...nodes.values(), master];
  const t0 = performance.now();
  // blocks never straddle a section boundary, so per-section stats are exact
  const bounds = [...secStartF, secEndLast].filter((b) => b > f0 && b < f1).sort((a, b) => a - b);
  let bi = 0;
  for (let fr = f0; fr < f1;) {
    while (bi < bounds.length && bounds[bi] <= fr) bi++;
    const lim = bi < bounds.length ? bounds[bi] : f1;
    const n = Math.min(BLOCK, f1 - fr, lim - fr), sec = secOf(fr), rel = fr - f0;
    for (const nd of allNodes) { nd.inL.fill(0, 0, n); nd.inR.fill(0, 0, n); nd.hadInput = false; }
    // raw stem blocks (also sidechain keys)
    for (const s of stemStrips) {
      const [rl, rr] = raw.get(s.name);
      s.has = s.stem.hasData(fr, n);
      if (s.has) s.stem.read(fr, n, rl, rr); else { rl.fill(0); rr.fill(0); }
    }
    for (const s of stemStrips) {
      if (s.mute || (!s.has && s.quietBlocks > s.tailBlocks)) { s.st.frames[sec] += n; continue; }
      const [rl, rr] = raw.get(s.name);
      s.L.set(rl.subarray(0, n)); s.R.set(rr.subarray(0, n));
      const c0 = performance.now();
      s.process(n, fr, keyFor);
      const c1 = performance.now();
      s.stats(n, sec, rel, sr);
      route(s, n, fr);
      s.msFx += c1 - c0; s.msOther += performance.now() - c1;
    }
    for (const nd of order) {
      if (!nd.hadInput && nd.quietBlocks > nd.tailBlocks) { nd.st.frames[sec] += n; continue; }
      nd.L.set(nd.inL.subarray(0, n)); nd.R.set(nd.inR.subarray(0, n));
      const c0 = performance.now();
      nd.process(n, fr, keyFor);
      const c1 = performance.now();
      nd.stats(n, sec, rel, sr);
      route(nd, n, fr);
      nd.msFx += c1 - c0; nd.msOther += performance.now() - c1;
    }
    master.L.set(master.inL.subarray(0, n)); master.R.set(master.inR.subarray(0, n));
    for (let i = 0; i < n; i++) if (Math.abs(master.L[i]) > 1 || Math.abs(master.R[i]) > 1) overs++;
    const m0 = performance.now();
    master.process(n, fr, keyFor);
    master.msFx += performance.now() - m0;
    master.stats(n, sec, rel, sr);
    outL.set(master.L.subarray(0, n), rel); outR.set(master.R.subarray(0, n), rel);
    fr += n;
  }
  function route(s, n, fr) {
    const t = target(s.out, s.name);
    const L = s.L, R = s.R;
    for (let i = 0; i < n; i++) { t.inL[i] += L[i]; t.inR[i] += R[i]; }
    t.hadInput = true;
    for (const se of s.sends) {
      const rt = nodes.get(se.target);
      const g = se.lane ? dbToGain(laneAt(se.lane, fr + n / 2)) : se.g;
      const srcL = se.pre ? s.preL : L, srcR = se.pre ? s.preR : R;
      if (g <= 1e-6) continue;
      for (let i = 0; i < n; i++) { rt.inL[i] += srcL[i] * g; rt.inR[i] += srcR[i] * g; }
      rt.hadInput = true;
    }
  }
  const mixMs = performance.now() - t0;
  for (const s of [...stemStrips, ...nodes.values(), master]) if (s.nanFixed) warnings.push(`${s.kind} "${s.name}": ${s.nanFixed} NaN/Inf samples replaced with 0`);
  if (overs) warnings.push(`master bus exceeded 0 dBFS on ${overs} samples before the master chain (fine in float; the limiter handles it, but consider lowering bus gains if large)`);
  const pack = (s) => ({ name: s.name, kind: s.kind, out: s.out, st: s.st, series: s.series, part: s.stem?.part, events: s.stem?.events.length ?? 0, renderMs: s.stem?.renderMs ?? 0, duck: s.duckCount ?? null, bytes: s.stem?.bytes ?? 0, msFx: Math.round(s.msFx), msStats: Math.round(s.msOther) });
  return {
    L: outL, R: outR, warnings, mixMs, overs,
    stems: stemStrips.map(pack), buses: [...nodes.values()].map(pack), master: pack(master),
    seriesHop: SERIES_HOP, order: order.map((o) => o.name),
  };
}
