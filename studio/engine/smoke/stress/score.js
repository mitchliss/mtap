// Stress test: the Producer's real score (full length) with deliberately dense engineer test parts.
// Used only to measure render time / memory of a worst-case full arrangement:
//   node --max-old-space-size=4096 studio/render.mjs --song studio/engine/smoke/stress --out studio/out/stress
// (falls back to the engineer's score.example.js if the Producer's score.js is missing)
export { default, cues } from '../../../song/score.js';
