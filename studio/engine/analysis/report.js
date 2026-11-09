// Render analysis: loudness, per-section band balance & stereo, per-stem levels, masking, images, text reports.
import fs from 'node:fs';
import path from 'node:path';
import { FFT, hann } from '../core/fft.js';
import { gainToDb } from '../core/util.js';
import { Biquad } from '../core/filters.js';
import { kWeightedPower, integratedFromPower, shortTermSeries, momentaryMax, loudnessRange, lufs } from './loudness.js';
import { truePeak } from '../fx/oversample.js';
import { Image, colormap, PALETTE } from './png.js';
import { BANDS } from '../mix/mixer.js';
import { labelChecks, checksMd } from './checks.js';

const N = 4096, HOP = 2048;
const db = (x) => (x > 0 ? 10 * Math.log10(x) : -Infinity);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** STFT pass over the master: per-section band power for M, S, L, R, LR and spectrogram columns */
function stftAnalysis(L, R, sr, t0, secs, specW) {
  const n = L.length, nF = Math.max(1, Math.floor((n - N) / HOP) + 1), f = FFT.get(N), w = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const nb = BANDS.length, nS = secs.length;
  const acc = Array.from({ length: nS }, () => ({ M: new Float64Array(nb), S: new Float64Array(nb), L: new Float64Array(nb), R: new Float64Array(nb), LR: new Float64Array(nb), frames: 0 }));
  const binBand = new Int32Array(N / 2 + 1);
  for (let k = 0; k <= N / 2; k++) { const fr = (k * sr) / N; let b = 0; while (b < nb - 1 && fr >= BANDS[b][2]) b++; binBand[k] = b; }
  const W = Math.min(specW, nF), cols = Array.from({ length: W }, () => new Float32Array(N / 2 + 1)), cnt = new Int32Array(W);
  for (let fi = 0; fi < nF; fi++) {
    const o = fi * HOP;
    for (let i = 0; i < N; i++) { re[i] = L[o + i] * w[i]; im[i] = R[o + i] * w[i]; }
    f.transform(re, im);
    const tc = t0 + (o + N / 2) / sr;
    let si = secs.findIndex((s) => tc >= s.start && tc < s.end); if (si < 0) si = nS - 1;
    const a = acc[si], col = Math.min(W - 1, Math.floor((fi * W) / nF)), C = cols[col];
    a.frames++;
    cnt[col]++;
    for (let k = 1; k <= N / 2; k++) {
      const k2 = k === N / 2 ? k : N - k;
      // separate L (real input) and R (imag input) spectra from one complex FFT
      const lr = (re[k] + re[k2]) / 2, li = (im[k] - im[k2]) / 2;
      const rr = (im[k] + im[k2]) / 2, ri = -(re[k] - re[k2]) / 2;
      const pL = lr * lr + li * li, pR = rr * rr + ri * ri, x = lr * rr + li * ri;
      const mr = (lr + rr) / 2, mi = (li + ri) / 2, sr2 = (lr - rr) / 2, si2 = (li - ri) / 2;
      const pM = mr * mr + mi * mi, pS = sr2 * sr2 + si2 * si2;
      const b = binBand[k];
      a.M[b] += pM; a.S[b] += pS; a.L[b] += pL; a.R[b] += pR; a.LR[b] += x;
      C[k] += pM;
    }
  }
  for (let c = 0; c < W; c++) if (cnt[c] > 1) for (let k = 0; k <= N / 2; k++) cols[c][k] /= cnt[c];
  return { acc, cols, W };
}

function drawSections(img, secs, x0, w, t0, t1, top, bottom, label = true) {
  const X = (t) => x0 + ((t - t0) / (t1 - t0)) * w;
  secs.forEach((s, i) => {
    if (s.name === '(tail)') return;
    const x = Math.round(X(s.start));
    img.vline(x, top, bottom, [255, 255, 255], 0.55, 3);
    if (label) img.text(x + 3, top + 2 + (i % 2) * 10, s.name, [255, 255, 255], 1, [0, 0, 0]);
  });
}
/** shade cue silence windows (score cues.silenceBeats) so they can be checked at a glance */
function drawSilences(img, silences, x0, w, t0, t1, top, bottom) {
  if (!silences || !silences.length) return;
  const X = (t) => x0 + ((t - t0) / (t1 - t0)) * w;
  for (const z of silences) {
    if (z.end < t0 || z.start > t1) continue;
    const a = Math.max(x0, Math.round(X(z.start))), b = Math.max(a + 1, Math.round(X(z.end)));
    img.rect(a, top, b - a, bottom - top + 1, [60, 200, 255], 0.22);
    img.vline(a, top, bottom, [60, 200, 255], 0.9); img.vline(b, top, bottom, [60, 200, 255], 0.9);
    img.text(a + 2, bottom - 10, 'sil', [120, 220, 255], 1, [0, 0, 0]);
  }
}
function timeAxis(img, x0, w, t0, t1, y) {
  const span = Math.max(1e-3, t1 - t0), pxPerSec = w / span;
  const step = [1, 2, 5, 10, 15, 30, 60, 120].find((st) => st * pxPerSec >= 42) || 300;
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = Math.round(x0 + ((t - t0) / (t1 - t0)) * w);
    img.vline(x, y, y + 4, [180, 180, 180]); img.text(x - 10, y + 6, fmtT(t), [180, 180, 180]);
  }
}

function spectrogramPng(cols, W, sr, t0, t1, secs, file, silences) {
  // cols hold mid-channel power of a Hann-windowed N-point FFT: scale so a full-scale sine reads 0 dBFS
  const norm = 16 / (N * N);
  const DW = Math.max(1200, W), ML = 52, MT = 26, MB = 22, H = 380, img = new Image(DW + ML + 8, H + MT + MB);
  const fMin = 30, fMax = 20000, lr = Math.log(fMax / fMin);
  // dB range from percentiles
  const vals = [];
  for (let c = 0; c < W; c += Math.max(1, Math.floor(W / 200))) for (let k = 4; k < N / 2; k += 7) vals.push(cols[c][k] * norm);
  vals.sort((a, b) => a - b);
  const top = Math.min(0, Math.ceil(db(vals[Math.floor(vals.length * 0.998)] || 1e-9) / 5) * 5), floor = top - 80;
  for (let y = 0; y < H; y++) {
    const fr = fMin * Math.exp((lr * (H - 1 - y)) / (H - 1)), fr2 = fMin * Math.exp((lr * (H - y)) / (H - 1));
    const k0 = (fr * N) / sr, k1 = Math.max(k0 + 1, (fr2 * N) / sr);
    for (let x = 0; x < DW; x++) {
      const C = cols[Math.min(W - 1, Math.floor((x * W) / DW))];
      let v;
      if (k1 - k0 <= 1.5) { const i = Math.floor(k0), t = k0 - i; v = C[i] * (1 - t) + C[i + 1] * t; }
      else { v = 0; let m = 0; for (let k = Math.floor(k0); k < Math.ceil(k1); k++) { v += C[k]; m++; } v /= m; }
      img.set(ML + x, MT + y, colormap((db(v * norm) - floor) / (top - floor)));
    }
  }
  for (const fr of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = MT + H - 1 - Math.round((Math.log(fr / fMin) / lr) * (H - 1));
    img.hline(ML - 4, ML - 1, y, [200, 200, 200]); img.hline(ML, ML + DW - 1, y, [255, 255, 255], 0.12);
    img.text(4, y - 3, fr >= 1000 ? `${fr / 1000}k` : String(fr), [200, 200, 200]);
  }
  drawSilences(img, silences, ML, DW, t0, t1, MT, MT + H - 1);
  drawSections(img, secs, ML, DW, t0, t1, MT, MT + H - 1);
  timeAxis(img, ML, DW, t0, t1, MT + H + 2);
  img.text(ML, 4, `master spectrogram (mid channel, log frequency), colour ${Math.round(floor)}..${Math.round(top)} dBFS per bin${silences && silences.length ? '; blue bands = cue silence windows' : ''}`, [230, 230, 230]);
  fs.writeFileSync(file, img.encode());
}

function stemsPng(mix, secs, t0, mixLength, sr, file, silences) {
  const t1 = t0 + mixLength / sr; // series cover the whole mixed range (before tail trim)
  // rows: each bus/return with its stems, then master
  const rows = [];
  const groups = new Map();
  for (const s of mix.stems) { if (!groups.has(s.out)) groups.set(s.out, []); groups.get(s.out).push(s); }
  const busNames = mix.buses.map((b) => b.name);
  for (const b of mix.buses) { rows.push({ label: `[${b.kind === 'return' ? 'fx' : 'bus'}] ${b.name}`, s: b, bus: true }); for (const s of groups.get(b.name) || []) rows.push({ label: `  ${s.name}`, s }); }
  for (const [out, ss] of groups) if (!busNames.includes(out)) for (const s of ss) rows.push({ label: `  ${s.name} >${out}`, s });
  rows.push({ label: '[master]', s: mix.master, bus: true });
  const W = 1600, ML = 150, MT = 26, RH = 14, H = rows.length * RH;
  const img = new Image(W + ML + 8, H + MT + 24);
  const hop = mix.seriesHop;
  rows.forEach((row, ri) => {
    const ser = row.s.series, y = MT + ri * RH;
    img.text(4, y + 3, row.label.slice(0, 24), row.bus ? [255, 220, 120] : [210, 210, 210]);
    for (let x = 0; x < W; x++) {
      const a = Math.floor((x / W) * ser.length), b = Math.max(a + 1, Math.floor(((x + 1) / W) * ser.length));
      let e = 0; for (let k = a; k < b && k < ser.length; k++) e += ser[k];
      const rmsDb = db(e / ((b - a) * hop * 2));
      const v = (rmsDb + 60) / 60;
      img.rect(ML + x, y + 1, 1, RH - 2, v > 0 ? colormap(0.15 + 0.85 * v) : [24, 24, 30]);
    }
    if (row.bus) img.hline(ML, ML + W - 1, y, [255, 255, 255], 0.25);
  });
  drawSilences(img, silences, ML, W, t0, t1, MT, MT + H - 1);
  drawSections(img, secs, ML, W, t0, t1, MT, MT + H - 1);
  timeAxis(img, ML, W, t0, t1, MT + H + 2);
  img.text(ML, 4, `per-stem / per-bus RMS over time (-60..0 dBFS, post-fader)${silences && silences.length ? '; blue bands = cue silence windows' : ''}`, [230, 230, 230]);
  fs.writeFileSync(file, img.encode());
}

// unpitched stems get their own lanes under the roll: drums (stems routed to a drum/perc bus, or named like a drum, or
// played only by DrumKit voices) and fx (risers, impacts, sweeps: an fx bus or an fx_ name)
const DRUM_KINDS = new Set(['kick', 'snare', 'clap', 'hat', 'openhat', 'ride', 'crash', 'tom', 'shaker', 'snap', 'rim']);
function laneOf(stem, evs) {
  const n = stem.name.toLowerCase(), out = String(stem.out || '').toLowerCase();
  if (/^(drums?|perc|percussion|beat|kit)$/.test(out) || /^(kick|snare|clap|hats?|openhat|ride|crash|cymbals?|toms?|perc|shaker|snap|rim|tamb|drums?)(_|$)/.test(n)) return 'drums';
  if (/^(fx|sfx|transitions?)$/.test(out) || /^(fx|sfx)_/.test(n)) return 'fx';
  if (evs.length && evs.every((e) => DRUM_KINDS.has(e.inst))) return 'drums';
  return 'pitched';
}
function pianorollPng(events, stems, secs, t0, t1, file, silences) {
  const ev = events.filter((e) => e.time + e.dur >= t0 && e.time <= t1 && Number.isFinite(e.midi));
  const byStem = new Map(stems.map((s) => [s.name, []]));
  for (const e of ev) { if (!byStem.has(e.stem)) byStem.set(e.stem, []); byStem.get(e.stem).push(e); }
  const allStems = [...byStem.keys()];
  const lane = new Map(allStems.map((nm) => [nm, laneOf(stems.find((s) => s.name === nm) || { name: nm }, byStem.get(nm))]));
  const pitched = ev.filter((e) => lane.get(e.stem) === 'pitched');
  const laneRows = ['drums', 'fx'].flatMap((k) => allStems.filter((nm) => lane.get(nm) === k && byStem.get(nm).length).map((nm) => ({ nm, k })));
  let lo = 127, hi = 0; for (const e of pitched) { lo = Math.min(lo, Math.round(e.midi)); hi = Math.max(hi, Math.round(e.midi)); }
  if (lo > hi) { lo = 36; hi = 84; }
  lo = Math.max(0, lo - 2); hi = Math.min(127, hi + 2);
  const RH = Math.max(3, Math.min(8, Math.floor(760 / (hi - lo + 1)))), W = 1600, ML = 64, MT = 40, H = (hi - lo + 1) * RH;
  const LH = 9, GAP = 14, LT = MT + H + GAP, LB = LT + laneRows.length * LH;
  const img = new Image(W + ML + 8, (laneRows.length ? LB : MT + H) + 24);
  for (let m = lo; m <= hi; m++) {
    const y = MT + (hi - m) * RH;
    if ([1, 3, 6, 8, 10].includes(m % 12)) img.rect(ML, y, W, RH, [26, 26, 32]);
    if (m % 12 === 0) { img.hline(ML, ML + W - 1, y + RH - 1, [90, 90, 110]); img.text(4, y + RH - 8, `C${m / 12 - 1}`, [170, 170, 170]); }
  }
  const col = new Map(allStems.map((s, i) => [s, PALETTE[i % PALETTE.length]]));
  const X = (t) => ML + ((t - t0) / (t1 - t0)) * W;
  for (const e of pitched) {
    const c = col.get(e.stem) || [200, 200, 200], x0 = X(e.time), x1 = Math.max(x0 + 2, X(e.time + e.dur)), y = MT + (hi - Math.round(e.midi)) * RH;
    img.rect(x0, y, x1 - x0, RH - 1, c, 0.35 + 0.6 * Math.min(1, e.vel ?? 0.8));
  }
  // drum / fx lanes: one row per stem, a tick per hit (fx: the event's length)
  laneRows.forEach(({ nm, k }, ri) => {
    const y = LT + ri * LH, c = col.get(nm) || [200, 200, 200];
    img.rect(ML, y, W, LH - 1, ri % 2 ? [22, 22, 28] : [28, 28, 36]);
    img.text(4, y + 1, nm.slice(0, 10), k === 'fx' ? [150, 200, 255] : [230, 200, 150]);
    for (const e of byStem.get(nm)) {
      const x0 = X(e.time), x1 = k === 'fx' ? Math.max(x0 + 2, X(e.time + e.dur)) : x0 + 1;
      img.rect(x0, y + 1, Math.max(1, x1 - x0), LH - 3, c, 0.3 + 0.7 * Math.min(1, e.vel ?? 0.8));
    }
  });
  const bottom = laneRows.length ? LB - 1 : MT + H - 1;
  drawSilences(img, silences, ML, W, t0, t1, MT, bottom);
  drawSections(img, secs, ML, W, t0, t1, MT, bottom);
  if (laneRows.length) img.hline(ML, ML + W - 1, LT - 3, [120, 120, 140]);
  timeAxis(img, ML, W, t0, t1, bottom + 2);
  let lx = ML;
  for (const s of allStems.filter((nm) => lane.get(nm) === 'pitched' && byStem.get(nm).length)) { const c = col.get(s); img.rect(lx, 4, 8, 8, c); lx += 12 + img.text(lx + 11, 5, s, [230, 230, 230]) + 8; if (lx > W - 60) break; }
  img.text(ML, 20, `logged note events per pitched stem${laneRows.length ? '; drum and fx stems in their own lanes below (one tick per hit)' : ''}`, [180, 180, 180]);
  fs.writeFileSync(file, img.encode());
}

/**
 * Full analysis + outputs. args: { outDir, L, R, sr, studio, mix, masterReport, timing, warnings, opts }
 */
export function analyzeAndReport(a) {
  const { outDir, L, R, sr, studio, mix } = a;
  const t0 = studio.range.start, t1 = t0 + L.length / sr;
  const secs = [...studio.sections.map((s) => ({ name: s.name, role: s.role, start: s.start, end: s.end, bars: s.bars, bpm: s.bpm0 === s.bpm1 ? s.bpm0 : `${s.bpm0}->${s.bpm1}`, energy: s.energy })), { name: '(tail)', role: 'tail', start: studio.songEnd, end: Infinity }];
  // loudness
  const kp = kWeightedPower([L, R], sr);
  const integrated = integratedFromPower(kp), st = shortTermSeries(kp);
  // reuse the master's final true-peak measurement when available (it is the same buffer)
  const tp = a.masterReport && Number.isFinite(a.masterReport.truePeakDb) ? Math.pow(10, a.masterReport.truePeakDb / 20) : Math.max(truePeak(L), truePeak(R));
  let samplePeak = 0, atFS = 0;
  for (let i = 0; i < L.length; i++) { const m = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (m > samplePeak) samplePeak = m; if (m >= 0.9999) atFS++; }
  // phone check: integrated loudness through a crude small-speaker response (HP 350 Hz 24 dB/oct + LP 12 kHz)
  const pl = Float32Array.from(L), pr = Float32Array.from(R);
  for (const X of [pl, pr]) { new Biquad('hp', 350, 0.54, 0, sr).process(X); new Biquad('hp', 350, 1.31, 0, sr).process(X); new Biquad('lp', 12000, 0.7, 0, sr).process(X); }
  const phoneLufs = lufs(pl, pr, sr);
  const { acc, cols, W } = stftAnalysis(L, R, sr, t0, secs, 1600);
  const checks = labelChecks({ L, R, sr, t0, studio, kS: kp, silences: a.silences, bandAcc: { acc, N, bands: BANDS.map((b) => b[0]), names: secs.map((s) => s.name) } });
  const sections = secs.map((s, i) => {
    const a0 = Math.max(0, Math.floor((s.start - t0) * 10)), a1 = Math.min(kp.pw.length, Math.ceil((Math.min(s.end, t1) - t0) * 10));
    if (a1 - a0 < 5) return null;
    const secLufs = integratedFromPower(kp, a0, a1);
    let stMax = -Infinity, stSum = 0, stN = 0; for (let k = a0; k < a1; k++) if (Number.isFinite(st[k])) { stMax = Math.max(stMax, st[k]); stSum += Math.pow(10, st[k] / 10); stN++; }
    const f0 = Math.floor(a0 * kp.sub), f1 = Math.min(L.length, Math.floor(a1 * kp.sub));
    let pk = 0, ss = 0; for (let k = f0; k < f1; k++) { const x = L[k], y = R[k]; ss += x * x + y * y; pk = Math.max(pk, Math.abs(x), Math.abs(y)); }
    const rmsDb = db(ss / (2 * Math.max(1, f1 - f0)));
    const A = acc[i], tot = A.M.reduce((p, q) => p + q, 0) + A.S.reduce((p, q) => p + q, 0);
    const bands = {}, stereo = {};
    BANDS.forEach(([nm], b) => {
      const e = A.M[b] + A.S[b];
      bands[nm] = { pct: r1((100 * e) / Math.max(1e-30, tot)), db: r1(db(e / Math.max(1e-30, tot))) };
      stereo[nm] = { corr: r2(A.LR[b] / Math.sqrt(Math.max(1e-30, A.L[b] * A.R[b]))), sideToMidDb: r1(db(A.S[b] / Math.max(1e-30, A.M[b]))) };
    });
    const allL = A.L.reduce((p, q) => p + q, 0), allR = A.R.reduce((p, q) => p + q, 0), allLR = A.LR.reduce((p, q) => p + q, 0);
    return {
      name: s.name, role: s.role, bars: s.bars, bpm: s.bpm, energy: s.energy, start: r2(s.start), end: r2(Math.min(s.end, t1)),
      lufs: r1(secLufs), shortTermMax: r1(stMax), shortTermMean: r1(stN ? 10 * Math.log10(stSum / stN) : -Infinity),
      peakDb: r1(gainToDb(pk)), rmsDb: r1(rmsDb), crestDb: r1(gainToDb(pk) - rmsDb), bands, stereo,
      correlation: r2(allLR / Math.sqrt(Math.max(1e-30, allL * allR))), sideToMidDb: r1(db(A.S.reduce((p, q) => p + q, 0) / Math.max(1e-30, A.M.reduce((p, q) => p + q, 0)))),
    };
  });
  // per-stem stats per section
  const events = studio.allEvents();
  const stemRows = mix.stems.map((s) => {
    const per = {};
    secs.forEach((sec, i) => {
      const fr = s.st.frames[i]; if (!fr) return;
      const rmsDb = db(s.st.sumSq[i] / (2 * fr));
      const notes = events.filter((e) => e.stem === s.name && e.time >= sec.start && e.time < sec.end).length;
      const g = s.st.gr[i];
      per[sec.name] = { rmsDb: r1(rmsDb), peakDb: r1(gainToDb(s.st.peak[i])), activePct: r1((100 * s.st.active[i]) / fr), notes, compGrAvg: g.n ? r1(g.sum / g.n) : undefined, compGrMax: g.n ? r1(g.max) : undefined };
    });
    return { name: s.name, bus: s.out, part: s.part, events: s.events, renderMs: Math.round(s.renderMs), memMB: Math.round(s.bytes / 1e6), ducked: s.duck, perSection: per };
  });
  const busRows = [...mix.buses, mix.master].map((b) => {
    const per = {};
    secs.forEach((sec, i) => { const fr = b.st.frames[i]; if (!fr) return; const g = b.st.gr[i]; per[sec.name] = { rmsDb: r1(db(b.st.sumSq[i] / (2 * fr))), peakDb: r1(gainToDb(b.st.peak[i])), compGrAvg: g.n ? r1(g.sum / g.n) : undefined, compGrMax: g.n ? r1(g.max) : undefined }; });
    return { name: b.name, kind: b.kind, out: b.out, perSection: per };
  });
  // cue silence windows: what is still sounding inside each (stems should be silent; reverb/delay tails may ring)
  const hop = mix.seriesHop;
  const silenceCheck = (a.silences || []).filter((z) => z.end > t0 && z.start < t1).map((z) => {
    const i0 = Math.max(0, Math.ceil(((z.start - t0) * sr) / hop) + 1), i1 = Math.floor(((z.end - t0) * sr) / hop);
    const lvl = (ser) => { let mx = 0; for (let i = i0; i < i1 && i < ser.length; i++) mx = Math.max(mx, ser[i]); return r1(db(mx / (2 * hop))); };
    const sounding = [...mix.stems, ...mix.buses].map((x) => ({ name: x.name, kind: x.kind, db: lvl(x.series) })).filter((x) => x.db !== null && x.db > -50).sort((p, q) => q.db - p.db);
    const fz = checks.gaps.find((g) => g.section === z.section) || {};
    return { section: z.section, beats: z.beats, start: r2(z.start), end: r2(z.end), masterMaxDb: lvl(mix.master.series), fileMaxDb: fz.fileMaxDb ?? null, fileMax2ndHalfDb: fz.fileMax2ndHalfDb ?? null, stemsSounding: sounding.filter((x) => x.kind === 'stem'), busesSounding: sounding.filter((x) => x.kind !== 'stem') };
  });
  // masking
  const masking = [];
  secs.forEach((sec, i) => {
    const per = mix.stems.map((s) => ({ s, b: s.st.bands[i], tot: s.st.bands[i].reduce((p, q) => p + q, 0) })).filter((x) => x.tot > 0);
    BANDS.forEach(([bn], b) => {
      const E = per.reduce((p, x) => p + x.b[b], 0);
      if (E <= 0) return;
      const strong = per.filter((x) => x.b[b] >= 0.22 * E && x.b[b] >= 0.2 * x.tot).sort((p, q) => q.b[b] - p.b[b]);
      for (let p = 0; p < strong.length; p++) for (let q = p + 1; q < strong.length; q++) {
        const A2 = strong[p], B2 = strong[q], diff = 10 * Math.log10(A2.b[b] / B2.b[b]);
        if (diff > 4.5) continue;
        const ducked = A2.s.duck || B2.s.duck;
        masking.push({ section: sec.name, band: bn, a: A2.s.name, b: B2.s.name, aPct: r1((100 * A2.b[b]) / E), bPct: r1((100 * B2.b[b]) / E), deltaDb: r1(diff), note: ducked ? 'one side is sidechain-ducked (may be intended)' : '' });
      }
    });
  });
  // heuristic flags
  const flags = [];
  for (const s of sections.filter(Boolean)) {
    if (s.role === 'tail') continue;
    if (s.bands.sub.pct > 40) flags.push(`${s.name}: sub (<60 Hz) is ${s.bands.sub.pct}% of energy -- heavy for phone speakers`);
    if (s.bands.presence.pct < 1.5 && s.lufs > -30) flags.push(`${s.name}: presence (3-8 kHz) only ${s.bands.presence.pct}% -- may sound dull/small on phones`);
    if (s.stereo.sub.corr !== null && s.stereo.sub.corr < 0.85 && s.bands.sub.pct > 3) flags.push(`${s.name}: sub band correlation ${s.stereo.sub.corr} -- keep lows mono`);
    if (s.correlation !== null && s.correlation < 0.15) flags.push(`${s.name}: overall L/R correlation ${s.correlation} -- very wide, check mono compatibility`);
  }
  for (const s of checks.sections) for (const fl of s.flags) flags.push(`${s.name}: ${fl} in the mono fold-down -- check the phone`);
  const report = {
    title: studio.title, generated: new Date().toISOString(), sampleRate: sr, bits: a.bits,
    range: { start: r2(t0), end: r2(t1), seconds: r2(t1 - t0), songEnd: r2(studio.songEnd) },
    loudness: {
      integratedLufs: r2(integrated), target: a.masterReport?.target, truePeakDbtp: r2(gainToDb(tp)), samplePeakDb: r2(gainToDb(samplePeak)),
      momentaryMax: r1(momentaryMax(kp)), shortTermMax: r1(Math.max(...Array.from(st).filter(Number.isFinite))), lra: r1(loudnessRange(st.filter((_, i) => i % 10 === 0))),
      phoneCheckLufs: r1(phoneLufs), phoneDropDb: r1(integrated - phoneLufs),
    },
    master: a.masterReport, sections: sections.filter(Boolean), checks, stems: stemRows, buses: busRows, masking, flags, silences: silenceCheck,
    clipping: { finalSamplesAtFullScale: atFS, wavClipped: a.wavClipped ?? 0, preMasterOvers: mix.overs },
    warnings: a.warnings, timing: a.timing, routing: { order: mix.order },
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(outDir, 'report.md'), reportMd(report));
  fs.writeFileSync(path.join(outDir, 'sections.txt'), sectionsTxt(report, events, secs));
  spectrogramPng(cols, W, sr, t0, t1, secs, path.join(outDir, 'spectrogram.png'), a.silences);
  stemsPng(mix, secs, t0, a.mixLength ?? L.length, sr, path.join(outDir, 'stems.png'), a.silences);
  pianorollPng(events, mix.stems.map((s) => ({ name: s.name, out: s.out })), secs, t0, t1, path.join(outDir, 'pianoroll.png'), a.silences);
  return report;
}

function reportMd(r) {
  const L = [];
  const lo = r.loudness;
  L.push(`# Render report: ${r.title}`, '', `Generated ${r.generated}. Range ${r.range.start}s to ${r.range.end}s (${fmtT(r.range.seconds)}), ${r.sampleRate} Hz / ${r.bits}-bit.`, '');
  L.push('## Loudness', '', '| metric | value |', '|---|---|',
    `| integrated (BS.1770) | **${lo.integratedLufs} LUFS** (target ${lo.target}) |`, `| true peak (4x) | **${lo.truePeakDbtp} dBTP** |`, `| sample peak | ${lo.samplePeakDb} dBFS |`,
    `| momentary max / short-term max | ${lo.momentaryMax} / ${lo.shortTermMax} LUFS |`, `| loudness range (LRA) | ${lo.lra} LU |`,
    `| phone check (HP 350 Hz) | ${lo.phoneCheckLufs} LUFS (${lo.phoneDropDb} dB drop) |`,
    `| samples at full scale | ${r.clipping.finalSamplesAtFullScale} (WAV clipped: ${r.clipping.wavClipped}) |`, '');
  if (r.master) L.push(`Master chain: pre-master ${r2(r.master.preLufs)} LUFS, drive ${r2(r.master.drive)} dB, limiter GR max ${r2(r.master.limiterGrMax)} dB / mean ${r2(r.master.limiterGrMean)} dB, file trimmed to ${r2(r.master.trimmedTo)} s.`, '');
  L.push('## Sections', '', '| section | role | time | bpm | LUFS | ST max | crest | sub | low | lowmid | mid | pres | air | corr | S/M dB |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of r.sections) L.push(`| ${s.name} | ${s.role} | ${fmtT(s.start)}-${fmtT(s.end)} | ${s.bpm ?? ''} | ${s.lufs} | ${s.shortTermMax} | ${s.crestDb} | ${['sub', 'low', 'lowmid', 'mid', 'presence', 'air'].map((b) => `${s.bands[b].pct}%`).join(' | ')} | ${s.correlation} | ${s.sideToMidDb} |`);
  L.push('', 'Band % = share of section energy (sub <60, low 60-250, lowmid 250-800, mid 0.8-3k, presence 3-8k, air 8k+).', '');
  L.push('### Stereo per band (correlation / side-to-mid dB)', '', '| section | sub | low | lowmid | mid | presence | air |', '|---|---|---|---|---|---|---|');
  for (const s of r.sections) L.push(`| ${s.name} | ${['sub', 'low', 'lowmid', 'mid', 'presence', 'air'].map((b) => `${s.stereo[b].corr} / ${s.stereo[b].sideToMidDb}`).join(' | ')} |`);
  if (r.checks) L.push('', ...checksMd(r.checks, fmtT));
  L.push('', '## Stems (post-fader RMS dBFS per section; GR = compressor gain reduction dB avg/max)', '');
  const names = r.sections.map((s) => s.name);
  L.push(`| stem | bus | ${names.join(' | ')} |`, `|---|---|${names.map(() => '---').join('|')}|`);
  for (const s of r.stems) L.push(`| ${s.name} | ${s.bus} | ${names.map((n) => { const p = s.perSection[n]; if (!p || p.rmsDb === null || p.rmsDb < -90) return '-'; return `${p.rmsDb}${p.compGrAvg ? ` (GR ${p.compGrAvg}/${p.compGrMax})` : ''}`; }).join(' | ')} |`);
  L.push('', '### Buses / returns', '', `| bus | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`);
  for (const b of r.buses) L.push(`| ${b.name} | ${names.map((n) => { const p = b.perSection[n]; if (!p || p.rmsDb === null || p.rmsDb < -90) return '-'; return `${p.rmsDb}${p.compGrAvg ? ` (GR ${p.compGrAvg}/${p.compGrMax})` : ''}`; }).join(' | ')} |`);
  L.push('', '## Masking warnings', '');
  if (!r.masking.length) L.push('None.');
  else for (const m of r.masking.slice(0, 60)) L.push(`- ${m.section} / ${m.band}: **${m.a}** (${m.aPct}%) vs **${m.b}** (${m.bPct}%), within ${m.deltaDb} dB ${m.note ? `(${m.note})` : ''}`);
  if (r.masking.length > 60) L.push(`- ... ${r.masking.length - 60} more in report.json`);
  if (r.silences && r.silences.length) {
    const dr = r.master && Number.isFinite(r.master.drive) ? r2(r.master.drive) : null;
    L.push('', '## Cue silence windows (score cues.silenceBeats)', '', `Max 50 ms RMS (dBFS) inside each window. **file** = the final WAV (after the master drive, clipper and limiter), whole window / 2nd half. The mix, stem and bus columns are measured before the master drive${dr !== null ? ` (add ${dr} dB to read them as in the file)` : ''}. Stems should be silent (< -50); returns may carry tails.`, '', '| section | window | file max | file 2nd half | mix max (pre-drive) | stems still sounding | buses/returns sounding |', '|---|---|---|---|---|---|---|');
    for (const z of r.silences) L.push(`| ${z.section} (${z.beats} beats) | ${fmtT(z.start)}.${String(Math.round((z.start % 1) * 10))}-${fmtT(z.end)}.${String(Math.round((z.end % 1) * 10))} | **${z.fileMaxDb ?? '-'}** | **${z.fileMax2ndHalfDb ?? '-'}** | ${z.masterMaxDb ?? '-inf'} | ${z.stemsSounding.map((x) => `${x.name} ${x.db}`).join(', ') || 'none'} | ${z.busesSounding.map((x) => `${x.name} ${x.db}`).join(', ') || 'none'} |`);
  }
  L.push('', '## Heuristic flags', '', ...(r.flags.length ? r.flags.map((f) => `- ${f}`) : ['None.']));
  L.push('', '## Warnings', '', ...(r.warnings.length ? r.warnings.map((w) => `- ${w}`) : ['None.']));
  const t = r.timing || {};
  L.push('', '## Timing', '', `Total ${r1((t.totalMs || 0) / 1000)} s: parts ${r1((t.partsMs || 0) / 1000)} s, mix ${r1((t.mixMs || 0) / 1000)} s, master ${r1((t.masterMs || 0) / 1000)} s, analysis ${r1((t.analysisMs || 0) / 1000)} s. Peak memory ${t.peakMemMB} MB.`, '');
  if (t.parts) for (const [k, v] of Object.entries(t.parts)) L.push(`- part ${k}: ${r1(v / 1000)} s`);
  return L.join('\n') + '\n';
}

function sectionsTxt(r, events, secs) {
  const out = [];
  for (const s of secs) {
    const sr = r.sections.find((x) => x.name === s.name);
    if (!sr) continue;
    const dur = Math.max(0.001, sr.end - sr.start);
    const playing = r.stems.filter((st) => { const p = st.perSection[s.name]; return p && (p.activePct > 5 || p.notes > 0); });
    const ev = events.filter((e) => e.time >= s.start && e.time < s.end);
    out.push(`== ${s.name} [${s.role}] ${fmtT(sr.start)}-${fmtT(sr.end)} (${s.bars ?? '-'} bars, ${s.bpm ?? '-'} bpm, energy ${s.energy ?? '-'})  ${sr.lufs} LUFS`);
    out.push(`   stems playing (${playing.length}): ${playing.map((p) => p.name).join(', ') || '(none)'}`);
    out.push(`   notes: ${ev.length} total, ${r1(ev.length / dur)} notes/s`);
    for (const p of playing) { const q = p.perSection[s.name]; out.push(`     ${p.name.padEnd(14)} notes ${String(q.notes).padStart(4)}  rms ${String(q.rmsDb).padStart(6)} dBFS  active ${q.activePct}%`); }
    // polyphony: max simultaneous notes
    const pts = []; for (const e of ev) { pts.push([e.time, 1], [e.time + e.dur, -1]); }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); let c = 0, mx = 0; for (const [, d] of pts) { c += d; mx = Math.max(mx, c); }
    out.push(`   density: ${playing.length} active stems, max polyphony ${mx}`);
    out.push('');
  }
  return out.join('\n');
}
