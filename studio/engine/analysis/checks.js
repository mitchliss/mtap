// Label-review tables, measured on the FINAL file (after the master drive, clipper and limiter):
//   - drop delta per transition into a drop (brief section 6: last-bar momentary max vs the drop, drop bar 1 vs the
//     build's last bar, the gap's 2nd-half 50 ms RMS, presence/air payoff)
//   - per section: ungated mean LUFS, PHONE SIM (mono fold-down, HP 350 Hz 24 dB/oct, K-weighted mean LUFS), mono loss,
//     short-term max from 3 s windows fully inside the section, Mid-channel band levels with Side-minus-Mid and the
//     mono fold-down loss per band
//   - builds per bar (mean LUFS, phone, momentary max, the 0.8-3 kHz band)
//   - low-end pitch per drop bar (one 65536-point Hann FFT of the Mid channel centred on the bar: strongest component
//     30-100 Hz, the cue kick-tail frequency, the bar's sub notes)
//   - cue silence windows measured on the file
// The maths matches the producer's drop-check scripts (same windows, same K-weighting, same powerSpectrum scaling),
// so numbers agree to about 0.1 dB. Rule thresholds follow the brief; `cues.gapMaxDb` and `cues.checks` override them.
import { powerSpectrum } from '../core/fft.js';
import { ButterChain } from '../core/filters.js';
import { kWeightedPower } from './loudness.js';
import { pcAtOrAbove } from '../theory.js';

const PC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC_IN = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const toL = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-20));
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const noteName = (m) => `${PC[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const BAND_DEF = { sub: [20, 60], low: [60, 250], lowmid: [250, 800], mid: [800, 3000], presence: [3000, 8000], air: [8000, 20000] };

/** 'D minor' + 2 -> { name: 'E minor', root: 4, mode: 'minor' } */
export function keyAt(key, transpose = 0) {
  const m = /^\s*([A-Ga-g])([#b]?)\s*(.*)$/.exec(String(key || ''));
  if (!m) return { name: '', root: null, mode: '' };
  const root = (((PC_IN[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + transpose) % 12) + 12) % 12;
  const mode = (m[3] || 'major').trim();
  return { name: `${PC[root]} ${mode}`, root, mode };
}

/**
 * args: { L, R, sr, t0 (song seconds of L[0]), studio, kS (kWeightedPower([L, R])), silences, bandAcc }
 * bandAcc (optional): the report's STFT accumulators { acc: [{ M, S, L, R, frames }] per section, N, bands, names }.
 * When given, the per-section band rows reuse them instead of running four more FFTs per frame over the whole song.
 */
export function labelChecks({ L, R, sr, t0, studio, kS, silences, bandAcc = null }) {
  const cues = studio.cues || {}, rules = cues.checks || {};
  const n = L.length, off = t0;
  const inFile = (a, b) => a - off >= -1e-6 && (b - off) * sr <= n + 1;
  // mono fold-down and the phone sim
  const M = new Float32Array(n);
  for (let i = 0; i < n; i++) M[i] = (L[i] + R[i]) / 2;
  const Mp = Float32Array.from(M);
  new ButterChain('hp', 350, 24, sr).process(Mp);
  // a mono fold-down played on both channels: twice the one-channel K-weighted power
  const dbl = (k) => { for (let i = 0; i < k.pw.length; i++) k.pw[i] *= 2; return k; };
  const kM = dbl(kWeightedPower([M], sr)), kP = dbl(kWeightedPower([Mp], sr));
  const { pw, sub } = kS;
  const blk = (t) => Math.floor(((t - off) * sr) / sub);
  const meanK = (k, a, b) => { let s = 0, c = 0; for (let i = Math.max(0, blk(a)); i < Math.min(k.pw.length, blk(b)); i++) { s += k.pw[i]; c++; } return c ? toL(s / (c * k.sub)) : -Infinity; };
  const mom = (i) => toL((pw[i] + pw[i - 1] + pw[i - 2] + pw[i - 3]) / (4 * sub));
  const momMax = (a, b) => { let m = -Infinity; for (let i = Math.max(3, blk(a) + 3); i < Math.min(pw.length, blk(b)); i++) m = Math.max(m, mom(i)); return m; };
  const stAt = (i) => { let a = 0; for (let k = 0; k < 30; k++) a += pw[i - k] || 0; return toL(a / (30 * sub)); };
  const stMaxInside = (a, b) => { let m = -Infinity; for (let i = Math.max(29, blk(a) + 30); i < Math.min(pw.length, blk(b)); i++) m = Math.max(m, stAt(i)); return m; };
  const rmsMax = (a, b, hop = 0.05) => {
    let m = -Infinity;
    for (let t = a; t + hop <= b + 1e-9; t += hop) {
      const i0 = Math.max(0, Math.round((t - off) * sr)), i1 = Math.min(n, Math.round((t + hop - off) * sr));
      if (i1 <= i0) continue;
      let s = 0; for (let i = i0; i < i1; i++) s += (L[i] * L[i] + R[i] * R[i]) / 2;
      m = Math.max(m, 10 * Math.log10(s / (i1 - i0) + 1e-20));
    }
    return m;
  };
  // band levels over a window: Mid, Side-minus-Mid, L+R average and correlation per band (4096-point frames, 50 % hop)
  const N4 = 4096, sc = { re: new Float64Array(N4), im: new Float64Array(N4) };
  const fm = new Float32Array(N4), fs = new Float32Array(N4), fl = new Float32Array(N4), fr = new Float32Array(N4);
  const pm = new Float64Array(N4 / 2 + 1), ps = new Float64Array(N4 / 2 + 1), pl = new Float64Array(N4 / 2 + 1), pr = new Float64Array(N4 / 2 + 1);
  function bands(a, b) {
    const acc = {};
    for (const k in BAND_DEF) acc[k] = { M: 0, S: 0, LR: 0 };
    let frames = 0;
    for (let o = Math.round((a - off) * sr); o + N4 <= Math.round((b - off) * sr) && o + N4 <= n; o += N4 / 2) {
      if (o < 0) continue;
      for (let k = 0; k < N4; k++) { const x = L[o + k], y = R[o + k]; fm[k] = (x + y) / 2; fs[k] = (x - y) / 2; fl[k] = x; fr[k] = y; }
      powerSpectrum(fm, 0, N4, pm, sc); powerSpectrum(fs, 0, N4, ps, sc); powerSpectrum(fl, 0, N4, pl, sc); powerSpectrum(fr, 0, N4, pr, sc);
      for (const k in BAND_DEF) {
        const [f0, f1] = BAND_DEF[k], A = acc[k];
        for (let j = Math.ceil((f0 * N4) / sr); j < Math.min(N4 / 2, (f1 * N4) / sr); j++) { A.M += pm[j]; A.S += ps[j]; A.LR += (pl[j] + pr[j]) / 2; }
      }
      frames++;
    }
    const out = {};
    for (const k in BAND_DEF) {
      const { M: m, S: s, LR: lr } = acc[k];
      out[k] = { M: 10 * Math.log10(m / Math.max(1, frames) + 1e-20), LR: 10 * Math.log10(lr / Math.max(1, frames) + 1e-20), SmM: 10 * Math.log10((s + 1e-20) / (m + 1e-20)), corr: (m - s) / (m + s + 1e-20), monoLoss: 10 * Math.log10((lr + 1e-20) / (m + 1e-20)) };
    }
    return { frames, b: out };
  }
  const secs = studio.sections;
  const endBpm = (s) => s.bpm1 ?? s.bpm0;

  // ------------------------------------------------------------------ per-section rows
  const sections = [];
  const LUFS = {};
  const fromAcc = (name) => {
    if (!bandAcc) return null;
    const i = bandAcc.names.indexOf(name), A = i >= 0 ? bandAcc.acc[i] : null;
    if (!A || !A.frames) return null;
    const norm = 16 / (bandAcc.N * bandAcc.N) / A.frames, out = {};
    bandAcc.bands.forEach((k, j) => {
      const m = A.M[j] * norm, sd = A.S[j] * norm, lr = ((A.L[j] + A.R[j]) / 2) * norm;
      out[k] = { M: 10 * Math.log10(m + 1e-20), LR: 10 * Math.log10(lr + 1e-20), SmM: 10 * Math.log10((sd + 1e-20) / (m + 1e-20)), corr: (m - sd) / (m + sd + 1e-20), monoLoss: 10 * Math.log10((lr + 1e-20) / (m + 1e-20)) };
    });
    return out;
  };
  for (const s of secs) {
    if (!inFile(s.start, s.end)) continue;
    const b = fromAcc(s.name) || bands(s.start, s.end).b;
    const mean = meanK(kS, s.start, s.end), mono = meanK(kM, s.start, s.end), phone = meanK(kP, s.start, s.end);
    LUFS[s.name] = mean;
    const flags = [];
    for (const k of ['presence', 'air']) if (b[k].monoLoss > 2) flags.push(`${k} mono loss ${r1(b[k].monoLoss)} dB`);
    sections.push({
      name: s.name, role: s.role, meanLufs: r1(mean), phoneLufs: r1(phone), monoLossLu: r1(mean - mono), stMaxInside: r1(stMaxInside(s.start, s.end)),
      mid: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { db: r1(v.M), sideMinusMid: r1(v.SmM), corr: r2(v.corr), monoLossDb: r1(v.monoLoss) }])),
      presMinusMid: r1(b.presence.M - b.mid.M), airMinusMid: r1(b.air.M - b.mid.M), flags,
    });
  }

  // ------------------------------------------------------------------ drop delta (every transition into a drop that ends a build or a gap)
  // thresholds: the score's cues.dropDelta (ceilingLU, floorLU, landLU, payoffPresenceDb, payoffAirDb, pairs), else
  // cues.checks.dropDelta ({ ceiling, floor, land, presence, air, gap }), else the brief's section 6 numbers
  const gapMax = cues.gapMaxDb || {}, dd = rules.dropDelta || {}, cd = cues.dropDelta || {};
  const ceilLu = cd.ceilingLU !== undefined ? -cd.ceilingLU : dd.ceiling ?? -1, floorLu = cd.floorLU !== undefined ? -cd.floorLU : dd.floor ?? -4;
  const landBuild = cd.landLU ?? dd.land ?? 1.5, presMin = cd.payoffPresenceDb ?? dd.presence ?? -2, airMin = cd.payoffAirDb ?? dd.air ?? -4;
  const pairSet = new Set((cd.pairs || []).map(([a, b]) => `${a}>${b}`));
  const dropDelta = [];
  secs.forEach((B, i) => {
    const D = secs[i + 1];
    if (!D) return;
    const g = (silences || []).find((z) => z.section === B.name);
    // every transition into a drop that ends a build or a gap, plus any pair the score lists
    if (!pairSet.has(`${B.name}>${D.name}`) && (D.role !== 'drop' || (B.role !== 'build' && !g))) return;
    if (!inFile(B.start, D.end)) return;
    const gs = g ? g.start : B.end, bar = 240 / endBpm(B), dbar = 240 / endBpm(D), isBuild = B.role === 'build';
    const lbMax = momMax(gs - bar, gs), lbMean = meanK(kS, gs - bar, gs), dMean = meanK(kS, D.start, D.end), d1 = meanK(kS, D.start, D.start + dbar);
    const gap = g ? rmsMax((g.start + g.end) / 2, g.end - 0.005) : null, gapLim = gapMax[B.name] ?? dd.gap ?? -30;
    const bt = bands(gs - 2, gs).b, dh = bands(D.start, D.start + 4).b;
    const dp = dh.presence.LR - bt.presence.LR, da = dh.air.LR - bt.air.LR;
    const pass = {
      ceiling: isBuild ? lbMax <= dMean + ceilLu && lbMax >= dMean + floorLu : null,
      lands: isBuild ? d1 >= lbMean + landBuild : d1 >= lbMean,
      gap: gap === null ? null : gap <= gapLim,
      payoff: isBuild ? dp >= presMin && da >= airMin : null,
    };
    dropDelta.push({ from: B.name, to: D.name, lastBarMomMax: r1(lbMax), dropMean: r1(dMean), lastBarMean: r1(lbMean), dropBar1Mean: r1(d1), gapMax2ndHalfDb: r1(gap), gapLimitDb: gap === null ? null : gapLim, presDeltaDb: r1(dp), airDeltaDb: r1(da), pass });
  });

  // ------------------------------------------------------------------ builds per bar
  const bandLR = (a, b, fa, fb) => {
    const sp = new Float64Array(N4 / 2 + 1); let acc = 0, fr2 = 0;
    for (let o = Math.round((a - off) * sr); o + N4 <= Math.round((b - off) * sr) && o + N4 <= n; o += N4 / 2) {
      if (o < 0) continue;
      for (const ch of [L, R]) { powerSpectrum(ch, o, N4, sp, sc); for (let k = Math.ceil((fa * N4) / sr); k < (fb * N4) / sr; k++) acc += sp[k] / 2; }
      fr2++;
    }
    return 10 * Math.log10(acc / Math.max(1, fr2) + 1e-20);
  };
  const builds = [];
  for (const s of secs.filter((x) => x.role === 'build')) {
    if (!inFile(s.start, s.end)) continue;
    const bars = [];
    for (let b = 0; b < s.bars; b++) { const a = s.at(b), e = s.at(b + 1); bars.push({ bar: b + 1, lufs: r1(meanK(kS, a, e)), phone: r1(meanK(kP, a, e)), momMax: r1(momMax(a, e)), mid: r1(bandLR(a, e, 800, 3000)) }); }
    const prev = secs[s.index - 1];
    const prevLast = prev && inFile(prev.at(prev.bars - 1), prev.end) ? r1(meanK(kS, prev.at(prev.bars - 1), prev.end)) : null;
    builds.push({ name: s.name, prev: prev?.name ?? null, prevMean: prev ? r1(LUFS[prev.name]) : null, prevLastBar: prevLast, bars });
  }

  // ------------------------------------------------------------------ low-end pitch per drop bar
  const NL = 65536, spec = new Float64Array(NL / 2 + 1), scL = { re: new Float64Array(NL), im: new Float64Array(NL) };
  const binDb = (f, tol = 0.025) => { let m = 0; for (let k = Math.floor((f * (1 - tol) * NL) / sr); k <= Math.ceil((f * (1 + tol) * NL) / sr); k++) m = Math.max(m, spec[k]); return 10 * Math.log10(m + 1e-20); };
  const strongest = (fLo, fHi) => { let bk = 0, bv = 0; for (let k = Math.ceil((fLo * NL) / sr); k < (fHi * NL) / sr; k++) if (spec[k] > bv) { bv = spec[k]; bk = k; } return { f: (bk * sr) / NL, db: 10 * Math.log10(bv + 1e-20) }; };
  const lowEnd = [];
  for (const s of secs.filter((x) => x.role === 'drop')) {
    if (!inFile(s.start, s.end)) continue;
    const key = keyAt(studio.key, s.transpose || 0);
    const tail = Number((cues.kickTailHz || {})[key.name]) || null, floor = (cues.subFloorMidi || {})[key.name] ?? 28;
    const tailMidi = tail ? 69 + 12 * Math.log2(tail / 440) : null;
    const rows = [];
    for (let b = 0; b < s.bars; b++) {
      const a = s.at(b), e = s.at(b + 1);
      powerSpectrum(M, Math.round(((a + e) / 2 - off) * sr) - NL / 2, NL, spec, scL);
      const cs = studio.chords.filter((c) => c.sectionIndex === s.index && c.start >= a - 1e-3 && c.start < e - 1e-3);
      const subs = [...new Set(cs.flatMap((c) => [pcAtOrAbove(c.bass, floor), pcAtOrAbove(c.root, floor)]))].sort((x, y) => x - y);
      const st = strongest(30, 100), tailDb = tail ? binDb(tail) : null, flags = [];
      const subRows = subs.map((m) => ({ note: noteName(m), hz: r1(hz(m)), db: r1(binDb(hz(m))) }));
      if (tail && !subs.some((x) => Math.abs(x - tailMidi) <= 0.25)) {
        for (const m of subs) {
          const d = Math.abs(m - tailMidi), sDb = binDb(hz(m));
          if (d > 0.25 && d <= 2.05 && tailDb > sDb - 6) flags.push(`kick tail ${tail} Hz (${r1(tailDb)}) is ${r1(d)} st from ${noteName(m)} (${r1(sDb)}): wants >= 6 dB under it`);
        }
      }
      // whatever the cue says: the strongest low component is neither a sub note, nor a chord fifth, and sits within
      // 2 semitones of a sub note that is at least 1 dB weaker (a mistuned kick tail or a stray bass note)
      if (st.db > -90) {
        const sm = 69 + 12 * Math.log2(st.f / 440), spc = ((Math.round(sm) % 12) + 12) % 12;
        const ok = cs.some((c) => spc === c.root || spc === c.bass || (c.pcs.includes((c.root + 7) % 12) && spc === (c.root + 7) % 12));
        if (!ok) for (const m of subs) {
          const d = Math.abs(m - sm), sDb = binDb(hz(m));
          if (d > 0.25 && d <= 2.05 && sDb <= st.db - 1) { flags.push(`strongest ${r1(st.f)} Hz is ${r1(d)} st from ${noteName(m)}, which is ${r1(st.db - sDb)} dB weaker`); break; }
        }
      }
      if (key.root !== null && cs.length && cs.every((c) => c.root === key.root)) {
        const tm = pcAtOrAbove(key.root, floor), tdb = Math.max(binDb(hz(tm)), binDb(hz(tm + 12)));
        if (tdb < st.db - 0.5) flags.push(`tonic ${noteName(tm)}/${noteName(tm + 12)} ${r1(tdb)} dB is not the strongest (${r1(st.f)} Hz ${r1(st.db)})`);
      }
      rows.push({ bar: b + 1, chords: cs.map((c) => c.symbol), strongestHz: r1(st.f), strongestDb: r1(st.db), tailDb: r1(tailDb), subs: subRows, flags });
    }
    lowEnd.push({ name: s.name, key: key.name, tailHz: tail, floor: noteName(floor), bars: rows });
  }

  // ------------------------------------------------------------------ cue silence windows on the file
  const gaps = (silences || []).filter((z) => inFile(z.start, z.end)).map((z) => ({ section: z.section, fileMaxDb: r1(rmsMax(z.start, z.end)), fileMax2ndHalfDb: r1(rmsMax((z.start + z.end) / 2, z.end - 0.005)) }));

  return { sections, dropDelta, builds, lowEnd, gaps, phoneSim: 'mono fold-down (L+R)/2, Butterworth HP 350 Hz 24 dB/oct, K-weighted, ungated section mean' };
}

/** markdown for report.md */
export function checksMd(c, fmtT) {
  const L = [];
  const f = (x) => (x === null || x === undefined ? '-' : x);
  const ok = (p) => (p === null || p === undefined ? 'n/a' : p ? 'ok' : '**FAIL**');
  L.push('## Label checks (measured on the final file)', '');
  if (c.dropDelta.length) {
    L.push('### Drop delta (brief section 6)', '',
      'Build last bar = the bar before the gap. Ceiling: last-bar momentary max between drop mean -4 and -1 LU. Lands: drop bar 1 >= build last bar +1.5 LU (>= for drop-to-drop). Gap: 50 ms RMS max over the gap\'s 2nd half. Payoff: presence / air (L+R) in the drop\'s first 4 s minus the build\'s last 2 s, >= -2 / -4 dB.', '',
      '| into | last bar M max | drop mean | ceiling | last bar mean | drop bar 1 | lands | gap 2nd half dBFS | gap | pres d | air d | payoff |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const d of c.dropDelta) L.push(`| ${d.from} -> ${d.to} | ${f(d.lastBarMomMax)} | ${f(d.dropMean)} | ${ok(d.pass.ceiling)} | ${f(d.lastBarMean)} | ${f(d.dropBar1Mean)} | ${ok(d.pass.lands)} | ${f(d.gapMax2ndHalfDb)}${d.gapLimitDb !== null ? ` (<= ${d.gapLimitDb})` : ''} | ${ok(d.pass.gap)} | ${f(d.presDeltaDb)} | ${f(d.airDeltaDb)} | ${ok(d.pass.payoff)} |`);
    L.push('');
  }
  L.push('### Phone sim, mono fold-down and Mid-channel bands per section', '',
    `Mean = ungated K-weighted section mean (LUFS). Phone = ${c.phoneSim}. Mono loss = stereo mean minus mono mean (LU). ST max = 3 s windows fully inside the section. Bands = Mid-channel level dB (Side minus Mid dB in brackets).`, '',
    '| section | mean | phone | mono loss | ST max | sub | low | lowmid | mid | pres | air | pres-mid | air-mid | mono loss pres / air dB |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of c.sections) {
    const b = (k) => `${f(s.mid[k].db)} (${f(s.mid[k].sideMinusMid)})`;
    L.push(`| ${s.name} | ${f(s.meanLufs)} | ${f(s.phoneLufs)} | ${f(s.monoLossLu)} | ${f(s.stMaxInside)} | ${['sub', 'low', 'lowmid', 'mid', 'presence', 'air'].map(b).join(' | ')} | ${f(s.presMinusMid)} | ${f(s.airMinusMid)} | ${f(s.mid.presence.monoLossDb)} / ${f(s.mid.air.monoLossDb)}${s.flags.length ? ' **(>2)**' : ''} |`);
  }
  L.push('');
  if (c.builds.length) {
    L.push('### Builds per bar', '', 'Mean LUFS, phone sim, momentary max and the 0.8-3 kHz band (L+R dB) per bar.', '');
    for (const b of c.builds) {
      L.push(`**${b.name}** (after ${f(b.prev)}: mean ${f(b.prevMean)}, last bar ${f(b.prevLastBar)})`, '', `| bar | ${b.bars.map((x) => x.bar).join(' | ')} |`, `|---|${b.bars.map(() => '---').join('|')}|`,
        `| LUFS | ${b.bars.map((x) => f(x.lufs)).join(' | ')} |`, `| phone | ${b.bars.map((x) => f(x.phone)).join(' | ')} |`, `| M max | ${b.bars.map((x) => f(x.momMax)).join(' | ')} |`, `| 0.8-3k | ${b.bars.map((x) => f(x.mid)).join(' | ')} |`, '');
    }
  }
  if (c.lowEnd.length) {
    L.push('### Low-end pitch per drop bar', '', 'One 65536-point (1.49 s) Hann FFT of the Mid channel centred on each bar. Kick tail from `cues.kickTailHz`, sub floor from `cues.subFloorMidi` (default E1). Flags (information only: the brief pass/fail rules stay in the producer check): the cue kick tail within 2 semitones of a sub note and less than 6 dB under it; the strongest component neither a sub note nor a chord fifth and within 2 semitones of a weaker sub note; on tonic bars, the tonic not the strongest component in 30-100 Hz.', '');
    for (const s of c.lowEnd) {
      L.push(`**${s.name}** (${s.key}, kick tail ${s.tailHz ?? '-'} Hz, sub floor ${s.floor})`, '', '| bar | chords | strongest 30-100 Hz | kick tail dB | sub notes dB | flags |', '|---|---|---|---|---|---|');
      for (const r of s.bars) L.push(`| ${r.bar} | ${r.chords.join(' ')} | ${f(r.strongestHz)} Hz ${f(r.strongestDb)} | ${f(r.tailDb)} | ${r.subs.map((x) => `${x.note} ${f(x.db)}`).join(', ')} | ${r.flags.join('; ') || '-'} |`);
      L.push('');
    }
  }
  void fmtT;
  return L;
}
