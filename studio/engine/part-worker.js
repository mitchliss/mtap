// Worker-thread runner for one part module (used by render.mjs to render parts in parallel).
// Receives { scoreFile, musicFile, partFile, partName, songDir, range, fast, tail, deps } and posts back the
// part's stems (audio chunks transferred, not copied), events, triggers and logs.
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { engine } from './index.js';
import { resolveScore } from './timeline.js';
import { createStudio } from './studio.js';

const imp = (f) => import(pathToFileURL(f).href);

async function run() {
  const w = workerData;
  const scoreMod = await imp(w.scoreFile), score = scoreMod.default;
  const { HATIKVAH_SCORE } = await imp(w.musicFile);
  const resolved = resolveScore(score, HATIKVAH_SCORE);
  const studio = createStudio({ score, cues: scoreMod.cues, resolved, engine, sr: engine.SR, range: w.range, fast: w.fast, songDir: w.songDir, tail: w.tail });
  // dependencies (export const after = [...]): their triggers, note-trigger times and logs are visible, not their audio
  for (const d of w.deps || []) studio._absorb({ triggers: d.triggers, autoTriggers: d.autoTriggers, logs: d.logs });
  const mark = studio._mark();
  studio.partName = w.partName;
  const t0 = performance.now();
  let error = null;
  try {
    const m = await imp(w.partFile);
    if (typeof m.default !== 'function') throw new Error('part module must `export default function part(studio)`');
    await m.default(studio);
  } catch (e) { error = { message: e.message, stack: e.stack }; }
  const ms = performance.now() - t0;
  const { data, transfer } = studio._export(null, mark);
  parentPort.postMessage({ ok: !error, error, ms, data, mem: process.memoryUsage().rss }, transfer);
}
run().catch((e) => parentPort.postMessage({ ok: false, error: { message: e.message, stack: e.stack }, ms: 0, data: null }));
