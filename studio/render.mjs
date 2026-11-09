#!/usr/bin/env node
// MTap Studio offline renderer.
//   node --max-old-space-size=4096 studio/render.mjs [--out studio/out/<dir>] [--only part1,part2] [--from <section>] [--to <section>]
//        [--fast] [--song <dir>] [--score <file>] [--bits 16|24] [--tail <s>] [--raw] [--serial] [--jobs N] [--cache] [--remix]
// Loads <song>/score.js (else score.example.js), runs every <song>/parts/*.js, mixes with <song>/mix.js, masters,
// and writes hatikvah.wav + report.json/.md + spectrogram.png + stems.png + pianoroll.png + sections.txt.
// Parts render in parallel worker threads (one per part file); `export const after = ['drums']` in a part makes it wait
// for those parts and see their triggers/logs. --serial runs every part in-process, in order.
// --cache saves the rendered stems to <out>/.cache; --remix skips the parts and re-mixes that cache (mix.js iteration).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { engine } from './engine/index.js';
import { resolveScore } from './engine/timeline.js';
import { createStudio, CHUNK } from './engine/studio.js';
import { mixdown } from './engine/mix/mixer.js';
import { masterPost } from './engine/mix/master.js';
import { analyzeAndReport } from './engine/analysis/report.js';
import { writeWav } from './engine/wav.js';

const STUDIO = path.dirname(fileURLToPath(import.meta.url));
const T0 = performance.now();
let peakMem = 0;
const mem = () => { const m = process.memoryUsage(); peakMem = Math.max(peakMem, m.rss / 1e6); };
const log = (...a) => console.log(...a);

const USAGE = `usage: node --max-old-space-size=4096 studio/render.mjs [options]
  --out <dir>        output folder (default studio/out/latest, or a name derived from --only/--from/--to)
  --only a,b         run only these part files (others are silent)
  --from <section>   start the render at this section (parts still see the whole song; audio outside is dropped)
  --to <section>     end the render after this section (+2 s of tail)
  --fast             quick-iteration quality (shorter/cheaper reverbs; parts may read studio.fast)
  --song <dir>       song folder (default studio/song): score.js | score.example.js, parts/, mix.js
  --score <file>     use this score module instead of <song>/score.js (e.g. a DJ extended-mix score); parts,
                     instruments and mix.js still come from --song
  --bits 16|24       WAV bit depth (default 24; 16 uses TPDF dither)
  --tail <s>         seconds rendered after the last section (default score.tail ?? 8)
  --raw              bypass the master post-chain (clip/limiter/loudness); mix.js master inserts still run
  --serial           run parts in-process one after another (easier stack traces / debugging)
  --jobs N           max parallel part workers (default min(8, cores-2))
  --cache            also save the rendered stems to <out>/.cache (for --remix)
  --remix            do not run parts: load <out>/.cache from an earlier --cache render and re-mix/master/analyse
                     (iterate on mix.js in seconds; warns if part files or the score changed since the cache)`;

function parseArgs(argv) {
  const o = { out: null, only: null, from: null, to: null, fast: false, song: path.join(STUDIO, 'song'), score: null, bits: 24, tail: null, raw: false, serial: false, jobs: 0, cache: false, remix: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = v(); else if (a === '--only') o.only = v().split(',').map((s) => s.trim().replace(/\.js$/, '')).filter(Boolean);
    else if (a === '--from') o.from = v(); else if (a === '--to') o.to = v(); else if (a === '--fast') o.fast = true;
    else if (a === '--song') o.song = path.resolve(v()); else if (a === '--score') o.score = path.resolve(v()); else if (a === '--bits') o.bits = parseInt(v(), 10);
    else if (a === '--tail') o.tail = parseFloat(v()); else if (a === '--raw') o.raw = true;
    else if (a === '--serial') o.serial = true; else if (a === '--jobs') o.jobs = Math.max(1, parseInt(v(), 10) || 1);
    else if (a === '--cache') o.cache = true; else if (a === '--remix') o.remix = true;
    else if (a === '--help' || a === '-h') { log(USAGE); process.exit(0); }
    else throw new Error(`unknown argument ${a}\n${USAGE}`);
  }
  if (o.bits !== 16 && o.bits !== 24) throw new Error('--bits must be 16 or 24');
  if (!o.out) o.out = path.join(STUDIO, 'out', o.only ? `only-${o.only.join('+')}` : o.from || o.to ? `${o.from || 'start'}-${o.to || 'end'}` : 'latest');
  o.out = path.resolve(o.out);
  return o;
}

async function importFile(f) { return import(pathToFileURL(f).href + `?t=${Date.now()}`); }
const fileHash = (f) => { try { return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12); } catch { return null; } };

// ---------------------------------------------------------------------------------------------- stem cache
function saveCache(dir, studio, meta) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const stems = [];
  let bytes = 0;
  for (const st of studio.stems.values()) {
    const idx = [];
    const fd = fs.openSync(path.join(dir, `${st.name}.f32`), 'w');
    st.chunks.forEach((c, ci) => {
      if (!c) return;
      idx.push(ci);
      fs.writeSync(fd, new Uint8Array(c[0].buffer, c[0].byteOffset, c[0].byteLength));
      fs.writeSync(fd, new Uint8Array(c[1].buffer, c[1].byteOffset, c[1].byteLength));
      bytes += c[0].byteLength * 2;
    });
    fs.closeSync(fd);
    stems.push({ name: st.name, part: st.part, chunks: idx, events: st.events, dropped: st.dropped, renderMs: st.renderMs });
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, chunk: CHUNK, stems, triggers: [...studio.triggers], logs: studio.logs }));
  return bytes;
}
function loadCache(dir, studio) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  if (meta.chunk !== CHUNK) throw new Error('stem cache was written with a different chunk size; re-render with --cache');
  const stems = meta.stems.map((s) => {
    const buf = fs.readFileSync(path.join(dir, `${s.name}.f32`));
    const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const chunks = s.chunks.map((ci, k) => [ci, f.slice(k * 2 * CHUNK, k * 2 * CHUNK + CHUNK), f.slice(k * 2 * CHUNK + CHUNK, (k + 1) * 2 * CHUNK)]);
    return { name: s.name, part: s.part, chunks, events: s.events, dropped: s.dropped, renderMs: s.renderMs };
  });
  // auto-triggers are rebuilt from the cached note events (same as stem.play would have recorded)
  const autoTriggers = new Map();
  for (const s of meta.stems) for (const e of s.events) { let a = autoTriggers.get(s.name); if (!a) { a = []; autoTriggers.set(s.name, a); } a.push(e.time); }
  studio._absorb({ stems, triggers: meta.triggers, autoTriggers: [...autoTriggers], logs: meta.logs });
  return meta;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.out, { recursive: true });
  const warnings = [];
  // score
  let scoreFile = opts.score || path.join(opts.song, 'score.js');
  if (opts.score && !fs.existsSync(scoreFile)) throw new Error(`--score: no file ${scoreFile}`);
  if (!fs.existsSync(scoreFile)) scoreFile = path.join(opts.song, 'score.example.js');
  if (!fs.existsSync(scoreFile)) throw new Error(`no score.js or score.example.js in ${opts.song}`);
  const scoreMod = await importFile(scoreFile), score = scoreMod.default, cues = scoreMod.cues || score.cues || {};
  const musicFile = path.join(STUDIO, '..', 'src', 'music.js');
  const { HATIKVAH_SCORE } = await importFile(musicFile);
  const resolved = resolveScore(score, HATIKVAH_SCORE);
  const secs = resolved.sections;
  const songEnd = secs[secs.length - 1].end;
  const fromSec = opts.from ? secs.find((s) => s.name === opts.from) : null;
  const toSec = opts.to ? secs.find((s) => s.name === opts.to) : null;
  if (opts.from && !fromSec) throw new Error(`--from: no section "${opts.from}" (have: ${secs.map((s) => s.name).join(', ')})`);
  if (opts.to && !toSec) throw new Error(`--to: no section "${opts.to}" (have: ${secs.map((s) => s.name).join(', ')})`);
  const tail = opts.tail ?? score.tail ?? 8;
  const range = { start: fromSec ? fromSec.start : 0, end: toSec && toSec !== secs[secs.length - 1] ? toSec.end + 2 : songEnd + tail };
  if (range.end <= range.start) throw new Error('--to section ends before --from section starts');
  log(`score: ${path.relative(process.cwd(), scoreFile)}  "${score.title}"  ${secs.length} sections, ${secs.reduce((a, s) => a + s.bars, 0)} bars, ${songEnd.toFixed(1)} s`);
  log(`range: ${range.start.toFixed(2)}-${range.end.toFixed(2)} s${opts.fast ? '  [fast]' : ''}${opts.remix ? '  [remix from cache]' : ''}  -> ${path.relative(process.cwd(), opts.out)}`);
  const studio = createStudio({ score, cues, resolved, engine, sr: engine.SR, range, fast: opts.fast, songDir: opts.song, tail });
  const silences = studio.silences;
  // parts
  const partsDir = path.join(opts.song, 'parts');
  const files = fs.existsSync(partsDir) ? fs.readdirSync(partsDir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort() : [];
  const partHashes = Object.fromEntries(files.map((f) => [f, fileHash(path.join(partsDir, f))]));
  const instHashes = (() => { const d = path.join(opts.song, 'instruments'); return fs.existsSync(d) ? Object.fromEntries(fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => [f, fileHash(path.join(d, f))])) : {}; })();
  const cacheDir = path.join(opts.out, '.cache');
  const cacheMeta = { score: fileHash(scoreFile), parts: partHashes, instruments: instHashes, range, fast: opts.fast, only: opts.only, songDir: opts.song };
  const partsMs = {};
  let failed = 0;
  const tp0 = performance.now();
  if (opts.remix) {
    if (!fs.existsSync(path.join(cacheDir, 'meta.json'))) throw new Error(`--remix: no stem cache in ${cacheDir}. Render once with --cache (same --out) first.`);
    const meta = loadCache(cacheDir, studio);
    const stale = [];
    if (meta.score !== cacheMeta.score) stale.push('score');
    for (const [f, h] of Object.entries({ ...partHashes })) if (meta.parts?.[f] !== h) stale.push(`parts/${f}`);
    for (const f of Object.keys(meta.parts || {})) if (!(f in partHashes)) stale.push(`parts/${f} (deleted)`);
    for (const [f, h] of Object.entries(instHashes)) if (meta.instruments?.[f] !== h) stale.push(`instruments/${f}`);
    if (Math.abs((meta.range?.start ?? 0) - range.start) > 1e-6 || Math.abs((meta.range?.end ?? 0) - range.end) > 1e-6) stale.push('range (--from/--to/--tail differ)');
    if (stale.length) warnings.push(`--remix: the stem cache is STALE (changed since it was rendered: ${stale.join(', ')}). Re-render with --cache to hear those changes.`);
    for (const s of meta.stems) partsMs[s.part] = (partsMs[s.part] || 0);
    log(`remix: loaded ${meta.stems.length} stems from cache${stale.length ? `  (STALE: ${stale.join(', ')})` : ''}`);
  } else {
    const mods = [];
    for (const f of files) {
      const name = f.replace(/\.js$/, '');
      if (opts.only && !opts.only.includes(name)) continue;
      try {
        const m = await importFile(path.join(partsDir, f));
        const after = m.after == null ? [] : Array.isArray(m.after) ? m.after.map(String) : [String(m.after)];
        mods.push({ name, m, file: path.join(partsDir, f), order: m.order ?? 100, after });
      } catch (e) { warnings.push(`part ${name} failed to load: ${e.message}`); console.error(`!! part ${name} failed to load:\n${e.stack}`); failed++; }
    }
    if (opts.only) for (const o of opts.only) if (!files.includes(`${o}.js`)) warnings.push(`--only: no part file ${o}.js`);
    mods.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    if (!mods.length) warnings.push('no part modules ran: the render is silent');
    const stemList = (name) => [...studio.stems.values()].filter((s) => String(s.part).split('+').includes(name)).map((s) => s.name).join(', ');
    const names = new Set(mods.map((p) => p.name));
    for (const p of mods) {
      const missing = p.after.filter((d) => !names.has(d));
      if (missing.length) warnings.push(`part ${p.name}: after [${missing.join(', ')}] not running (missing or excluded by --only); ignored`);
      p.after = p.after.filter((d) => names.has(d) && d !== p.name);
    }
    const jobs = opts.jobs || Math.max(2, Math.min(8, os.availableParallelism() - 2));
    if (opts.serial || mods.length <= 1 || jobs <= 1) {
      for (const { name, m } of mods) {
        studio.partName = name;
        const t = performance.now();
        try {
          if (typeof m.default !== 'function') throw new Error('part module must `export default function part(studio)`');
          await m.default(studio);
        } catch (e) { failed++; warnings.push(`part ${name} threw: ${e.message}`); console.error(`!! part ${name} threw:\n${e.stack}`); }
        partsMs[name] = performance.now() - t; mem();
        log(`part ${name.padEnd(10)} ${(partsMs[name] / 1000).toFixed(1).padStart(6)} s  stems: ${stemList(name)}`);
      }
    } else {
      // parallel: one worker per part, at most `jobs` at a time, respecting `after`; merged in (order, name) order
      log(`parts: ${mods.length} in parallel (up to ${jobs} workers)`);
      const results = new Map(), running = new Set();
      await new Promise((resolve) => {
        const launch = () => {
          for (const p of mods) {
            if (running.size >= jobs) break;
            if (results.has(p.name) || running.has(p.name) || !p.after.every((d) => results.has(d))) continue;
            running.add(p.name);
            const deps = p.after.map((d) => results.get(d).data).filter(Boolean).map((d) => ({ triggers: d.triggers, autoTriggers: d.autoTriggers, logs: d.logs }));
            const wk = new Worker(new URL('./engine/part-worker.js', import.meta.url), {
              workerData: { scoreFile, musicFile, partFile: p.file, partName: p.name, songDir: opts.song, range, fast: opts.fast, tail, deps },
              resourceLimits: { maxOldGenerationSizeMb: 3072 },
            });
            let settled = false;
            const finish = (res) => {
              if (settled) return; settled = true;
              running.delete(p.name); results.set(p.name, res); mem();
              const nStems = res.data ? res.data.stems.map((s) => s.name).join(', ') : '';
              log(`part ${p.name.padEnd(10)} ${(res.ms / 1000).toFixed(1).padStart(6)} s  stems: ${nStems}${res.ok ? '' : '  [FAILED]'}`);
              if (results.size === mods.length) resolve(); else launch();
            };
            wk.once('message', (res) => { finish(res); wk.terminate(); });
            wk.once('error', (e) => finish({ ok: false, error: { message: e.message, stack: e.stack }, ms: 0, data: null }));
            wk.once('exit', (code) => finish({ ok: false, error: { message: `worker exited (code ${code}) without a result` }, ms: 0, data: null }));
          }
          if (!running.size && results.size < mods.length) { // nothing runnable: dependency cycle
            for (const p of mods) if (!results.has(p.name)) results.set(p.name, { ok: false, error: { message: `dependency cycle in after: [${p.after.join(', ')}]` }, ms: 0, data: null });
            resolve();
          }
        };
        launch();
      });
      for (const p of mods) {
        const res = results.get(p.name);
        partsMs[p.name] = res.ms;
        if (res.data) studio._absorb(res.data);
        if (!res.ok) { failed++; warnings.push(`part ${p.name} threw: ${res.error.message}`); console.error(`!! part ${p.name} threw:\n${res.error.stack || res.error.message}`); }
      }
      mem();
    }
    studio.partName = null;
    if (opts.cache) {
      const tc = performance.now();
      const bytes = saveCache(cacheDir, studio, cacheMeta);
      log(`cache: ${studio.stems.size} stems (${(bytes / 1e6).toFixed(0)} MB) -> ${path.relative(process.cwd(), cacheDir)} in ${((performance.now() - tc) / 1000).toFixed(1)} s`);
    }
  }
  const partsTotal = performance.now() - tp0;
  // mix
  let mixFile = path.join(opts.song, 'mix.js');
  if (!fs.existsSync(mixFile)) { mixFile = path.join(STUDIO, 'song', 'mix.js'); warnings.push(`no mix.js in ${opts.song}; using studio/song/mix.js`); }
  let mixCfg = (await importFile(mixFile)).default;
  if (typeof mixCfg === 'function') mixCfg = mixCfg(studio);
  const tm0 = performance.now();
  const mix = mixdown(studio, mixCfg, { fast: opts.fast });
  warnings.push(...mix.warnings);
  const mixMs = performance.now() - tm0; mem();
  log(`mix: ${studio.stems.size} stems, ${mix.buses.length} buses/returns in ${(mixMs / 1000).toFixed(1)} s`);
  // free stem memory
  for (const s of studio.stems.values()) s.chunks = [];
  // master
  const tma = performance.now();
  let L = mix.L, R = mix.R, masterReport = null;
  if (!opts.raw) {
    const res = masterPost(L, R, mixCfg.master || {}, engine.SR, log);
    L = res.L; R = res.R; masterReport = res.report;
  } else masterReport = { note: '--raw: master post-chain bypassed' };
  const mixLength = mix.L.length;
  mix.L = mix.R = null; // the mixed (pre-master) buffers are no longer needed
  const masterMs = performance.now() - tma; mem();
  const wavPath = path.join(opts.out, 'hatikvah.wav');
  const w = writeWav(wavPath, L, R, engine.SR, opts.bits);
  // analysis
  const ta = performance.now();
  const timing = { partsMs: partsTotal, parts: partsMs, mixMs, masterMs, remix: opts.remix };
  const report = analyzeAndReport({ outDir: opts.out, L, R, sr: engine.SR, studio, mix, masterReport, warnings, timing, bits: opts.bits, wavClipped: w.clipped, silences, mixLength });
  timing.analysisMs = performance.now() - ta; mem();
  timing.totalMs = performance.now() - T0; timing.peakMemMB = Math.round(peakMem);
  // rewrite with final timing
  report.timing = timing;
  fs.writeFileSync(path.join(opts.out, 'report.json'), JSON.stringify(report, null, 1));
  const md = fs.readFileSync(path.join(opts.out, 'report.md'), 'utf8').replace(/## Timing[\s\S]*$/, '');
  const costly = [...mix.stems, ...mix.buses, mix.master].filter((s) => s.msFx + s.msStats > 0).sort((a, b) => (b.msFx + b.msStats) - (a.msFx + a.msStats)).slice(0, 8);
  fs.writeFileSync(path.join(opts.out, 'report.md'), md + `## Timing\n\nTotal ${(timing.totalMs / 1000).toFixed(1)} s: parts ${(partsTotal / 1000).toFixed(1)} s${opts.remix ? ' (remix: loaded from cache)' : ''}, mix ${(mixMs / 1000).toFixed(1)} s, master ${(masterMs / 1000).toFixed(1)} s, analysis ${(timing.analysisMs / 1000).toFixed(1)} s. Peak RSS ${timing.peakMemMB} MB.\n\n`
    + Object.entries(partsMs).map(([k, v]) => `- part ${k}: ${(v / 1000).toFixed(1)} s`).join('\n') + '\n\n'
    + `Most expensive mixer strips (inserts / stats+routing): ${costly.map((s) => `${s.name} ${(s.msFx / 1000).toFixed(1)}/${(s.msStats / 1000).toFixed(1)} s`).join(', ')}\n`);
  const lo = report.loudness;
  log(`\n${path.relative(process.cwd(), wavPath)}  ${(L.length / engine.SR).toFixed(1)} s, ${(w.bytes / 1e6).toFixed(1)} MB`);
  log(`loudness ${lo.integratedLufs} LUFS (target ${masterReport?.target ?? '-'}), true peak ${lo.truePeakDbtp} dBTP, LRA ${lo.lra} LU, phone drop ${lo.phoneDropDb} dB`);
  log(`masking warnings: ${report.masking.length}, flags: ${report.flags.length}, warnings: ${warnings.length}`);
  for (const wr of warnings.slice(0, 12)) log(`  ! ${wr}`);
  if (warnings.length > 12) log(`  ! ... ${warnings.length - 12} more in report.md`);
  log(`done in ${(timing.totalMs / 1000).toFixed(1)} s (peak RSS ${timing.peakMemMB} MB)`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
