#!/usr/bin/env node
// Instrument probe: render a few notes of one instrument and print what you would otherwise have to hear.
//   node studio/engine/tools/probe.mjs "<constructor expression>" [--notes 52,64,76] [--vel 0.85,0.5] [--dur 1]
//        [--text ah] [--chord] [--wav out.wav] [--png out.png] [--json]
// The expression is evaluated with E = engine and I = engine.inst in scope, e.g.
//   node studio/engine/tools/probe.mjs "new I.Piano({ tone: 'felt' })" --notes 48,60,72
//   node studio/engine/tools/probe.mjs "new I.Synth('supersaw-lead', { filter: { cutoff: 3000 } })" --dur 0.5
//   node studio/engine/tools/probe.mjs "new (await import('../../song/instruments/a-felt.js')).FeltPiano()"
// Per note it prints: peak / RMS dBFS, octave-band spectrum of the attack (first ~0.19 s) and of the body
// (0.3-0.8 s) relative to the loudest band, spectral centroid, time to -40 dB, DC and NaN count.
// Reference points (attack spectra, dB re loudest octave): a bright steel-string pluck sits around 4k -14 / 8k -25;
// a grand piano mf around 4k -15 / 8k -25; a pop vocal "ah" around 2k -15..-25 / 4k -20..-25 / 8k -35.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engine as E } from '../index.js';
import { FFT, hann } from '../core/fft.js';
import { writeWav } from '../wav.js';
import { Image, colormap } from '../analysis/png.js';

const SR = E.SR, HERE = path.dirname(fileURLToPath(import.meta.url)), CWD = process.cwd();
const args = process.argv.slice(2);
if (!args.length || args[0] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(0); }
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const expr = args[0];
const notes = opt('--notes', '52,64,76').split(',').map(Number);
const vels = opt('--vel', '0.85,0.5').split(',').map(Number);
const dur = parseFloat(opt('--dur', '1'));
const text = opt('--text', 'ah');

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
process.chdir(HERE); // so relative imports in the expression resolve from studio/engine/tools
const inst = await new AsyncFunction('E', 'I', `return (${expr});`)(E, E.inst);
if (!inst || typeof inst.render !== 'function') throw new Error('expression must evaluate to an instrument (object with render(note))');

const CF = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
function octaves(x, from, to) {
  const N = 8192, f = FFT.get(N), w = hann(N), re = new Float64Array(N), im = new Float64Array(N), acc = new Float64Array(CF.length);
  let num = 0, den = 0;
  for (let o = from - N / 2; o + N / 2 <= to; o += N / 2) {
    for (let i = 0; i < N; i++) { const j = o + i; re[i] = (j >= 0 && j < x.length ? x[j] : 0) * w[i]; im[i] = 0; }
    f.transform(re, im);
    for (let k = 1; k < N / 2; k++) {
      const fr = (k * SR) / N, p = re[k] * re[k] + im[k] * im[k];
      num += p * fr; den += p;
      const b = CF.findIndex((c) => fr < c * Math.SQRT2); if (b >= 0) acc[b] += p;
    }
  }
  const mx = Math.max(...acc);
  return { bands: CF.map((c, i) => [c, mx > 0 ? 10 * Math.log10(acc[i] / mx + 1e-14) : -140]), centroid: den ? num / den : 0 };
}
const fmtB = (b) => b.map(([c, d]) => `${c >= 1000 ? c / 1000 + 'k' : c}:${Math.max(-99, Math.round(d))}`).join(' ');

const results = [];
const mixL = [], mixR = [];
let tCursor = 0;
const renders = [];
if (flag('--chord')) for (const v of vels) renders.push({ midis: notes, vel: v });
else for (const m of notes) for (const v of vels) renders.push({ midis: [m], vel: v });
for (const r of renders) {
  const t0 = performance.now();
  const parts = r.midis.map((m) => {
    const res = inst.render({ midi: m, vel: r.vel, dur, text, time: 0 });
    const s = res instanceof Float32Array ? [res, res, 0] : Array.isArray(res) ? [res[0], res[1] || res[0], 0] : [res.L, res.R || res.L, res.offset || 0];
    return { L: s[0], R: s[1], o: Math.max(0, Math.round(-s[2] * SR)) }; // o = samples of audio before the note-on
  });
  const ms = performance.now() - t0;
  const off = Math.max(...parts.map((p) => p.o)), len = Math.max(...parts.map((p) => off - p.o + p.L.length));
  let L = new Float32Array(len), R = new Float32Array(len);
  for (const p of parts) { const d = off - p.o; for (let i = 0; i < p.L.length; i++) { L[d + i] += p.L[i]; R[d + i] += p.R[i]; } }
  let end = L.length; while (end > 1 && Math.abs(L[end - 1]) < 1e-7 && Math.abs(R[end - 1]) < 1e-7) end--;
  L = L.subarray(0, end); R = R.subarray(0, end);
  const M = new Float32Array(end); let pk = 0, ss = 0, dc = 0, nan = 0;
  for (let i = 0; i < end; i++) { const a = L[i], b = R[i]; if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; } M[i] = (a + b) * 0.5; pk = Math.max(pk, Math.abs(a), Math.abs(b)); ss += a * a + b * b; dc += a + b; }
  let last = 0; for (let i = 0; i < end; i++) if (Math.abs(M[i]) > pk * 0.01) last = i;
  const att = octaves(M, off, off + Math.round(0.19 * SR)), body = octaves(M, off + Math.round(0.3 * SR), off + Math.round(0.8 * SR));
  const row = { midi: r.midis.join('+'), vel: r.vel, ms: Math.round(ms), seconds: +(end / SR).toFixed(2), peakDb: +(20 * Math.log10(pk + 1e-12)).toFixed(1), rmsDb: +(10 * Math.log10(ss / (2 * end) + 1e-20)).toFixed(1),
    attack: att.bands, body: body.bands, centroidHz: Math.round(att.centroid), to40dB: +((last - off) / SR).toFixed(2), dc: dc / (2 * end), nan };
  results.push(row);
  if (!flag('--json')) {
    console.log(`midi ${row.midi} vel ${row.vel}: peak ${row.peakDb} dBFS, rms ${row.rmsDb}, centroid ${row.centroidHz} Hz, -40 dB after ${row.to40dB} s, ${row.ms} ms to render${nan ? `, NaN ${nan}!` : ''}${Math.abs(row.dc) > 1e-3 ? `, DC ${row.dc.toExponential(1)}!` : ''}`);
    console.log(`   attack ${fmtB(att.bands)}`);
    console.log(`   body   ${fmtB(body.bands)}`);
  }
  mixL.push([tCursor, L]); mixR.push([tCursor, R]); tCursor += end + Math.round(0.25 * SR);
}
if (flag('--json')) console.log(JSON.stringify(results, null, 1));
if (opt('--wav') || opt('--png')) {
  const L = new Float32Array(tCursor), R = new Float32Array(tCursor);
  mixL.forEach(([t, x]) => L.set(x, t)); mixR.forEach(([t, x]) => R.set(x, t));
  if (opt('--wav')) { writeWav(path.resolve(CWD, opt('--wav')), L, R, SR, 24); console.log(`wrote ${opt('--wav')}`); }
  if (opt('--png')) {
    const N = 2048, hop = Math.max(256, Math.floor(tCursor / 1200)), W = Math.floor((tCursor - N) / hop), H = 300, img = new Image(W + 50, H + 20);
    const f = FFT.get(N), w = hann(N), re = new Float64Array(N), im = new Float64Array(N), fMin = 30, lr = Math.log(20000 / fMin);
    for (let c = 0; c < W; c++) {
      for (let i = 0; i < N; i++) { re[i] = (L[c * hop + i] + R[c * hop + i]) * 0.5 * w[i]; im[i] = 0; }
      f.transform(re, im);
      for (let y = 0; y < H; y++) { const fr = fMin * Math.exp((lr * (H - 1 - y)) / (H - 1)), k = Math.min(N / 2 - 1, Math.max(1, Math.round((fr * N) / SR))); const p = (re[k] ** 2 + im[k] ** 2) * 16 / (N * N); img.set(50 + c, 10 + y, colormap((10 * Math.log10(p + 1e-20) + 100) / 90)); }
    }
    for (const fr of [100, 1000, 10000]) { const y = 10 + H - 1 - Math.round((Math.log(fr / fMin) / lr) * (H - 1)); img.text(2, y - 3, fr >= 1000 ? `${fr / 1000}k` : String(fr)); }
    fs.writeFileSync(path.resolve(CWD, opt('--png')), img.encode()); console.log(`wrote ${opt('--png')}`);
  }
}
