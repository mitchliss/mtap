// Voice allocation and humanize/groove helpers. Notes are plain objects { time, dur, midi, vel, ... }.
import { Rng, clamp } from './util.js';

/**
 * Limit polyphony: when more than `max` notes overlap, the oldest is cut short (voice stealing).
 * Returns new note objects (durations possibly shortened). `release` keeps a tiny overlap (s).
 */
export function limitPolyphony(notes, max = 8, release = 0.03) {
  const sorted = notes.map((n) => ({ ...n })).sort((a, b) => a.time - b.time);
  const active = [];
  for (const n of sorted) {
    for (let i = active.length - 1; i >= 0; i--) if (active[i].time + active[i].dur <= n.time) active.splice(i, 1);
    if (active.length >= max) { const old = active.shift(); old.dur = Math.max(0.01, n.time - old.time + release); }
    active.push(n);
  }
  return sorted;
}

/** Mono voice: each note ends where the next begins (minus gap). Marks `legato: true` when notes touch/overlap. */
export function monoLegato(notes, gap = 0) {
  const s = notes.map((n) => ({ ...n })).sort((a, b) => a.time - b.time);
  for (let i = 0; i < s.length - 1; i++) {
    const nx = s[i + 1];
    if (s[i].time + s[i].dur >= nx.time - 1e-4) { s[i].dur = Math.max(0.01, nx.time - s[i].time - gap); nx.legato = true; }
  }
  return s;
}

/**
 * Allocates notes to a fixed set of voices (e.g. 6 guitar strings, or N synth voices) so each voice
 * plays one note at a time. pickVoice(note, voices) may choose; default = free voice or oldest.
 * Returns notes with a `voice` index and durations cut where a voice is re-used.
 */
export class VoicePool {
  constructor(count) { this.count = count; this.last = new Array(count).fill(null); }
  assign(notes) {
    const out = notes.map((n) => ({ ...n })).sort((a, b) => a.time - b.time);
    for (const n of out) {
      let v = -1, oldest = Infinity;
      for (let i = 0; i < this.count; i++) {
        const l = this.last[i];
        if (!l || l.time + l.dur <= n.time) { v = i; break; }
        if (l.time < oldest) { oldest = l.time; v = i; }
      }
      const prev = this.last[v];
      if (prev && prev.time + prev.dur > n.time) prev.dur = Math.max(0.01, n.time - prev.time);
      n.voice = v; this.last[v] = n;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Humanize & groove
// ---------------------------------------------------------------------------
/**
 * Humanize note timing/velocity.
 * p: { timing=0.006 (s, std dev), velocity=0.06 (std dev, 0..1 scale), seed, late=0 (s constant push, + = behind the beat),
 *      maxShift=0.02 }
 */
export function humanize(notes, p = {}) {
  const rng = new Rng(p.seed ?? 'human'), sd = p.timing ?? 0.006, vsd = p.velocity ?? 0.06, mx = p.maxShift ?? 0.02, late = p.late ?? 0;
  return notes.map((n) => ({
    ...n,
    time: Math.max(0, n.time + late + clamp(rng.gauss(0, sd), -mx, mx)),
    vel: clamp((n.vel ?? 0.8) + rng.gauss(0, vsd), 0.05, 1),
  }));
}

/** MPC-style swing. pct 50 = straight, 54-58 = typical house/pop shuffle, 66 = triplet. Returns delay in 16th-steps for a step index. */
export function swingOffset(step, pct = 50) { return step % 2 === 1 ? (2 * pct) / 100 - 1 : 0; }

/**
 * Velocity accent pattern helper: returns velocity for 16th-step index within a bar.
 * Default pop accent: downbeats strongest, offbeat 8ths next, 16ths weakest.
 */
export function accent(step, { beat = 1, eighth = 0.82, sixteenth = 0.66 } = {}) {
  const s = ((step % 16) + 16) % 16;
  return s % 4 === 0 ? beat : s % 2 === 0 ? eighth : sixteenth;
}

/** Parse a step pattern string 'x..x..x.x...x...' (x/X = hit, X accented, o = ghost, . = rest) into [{step, vel}] */
export function pattern(str, { vel = 0.85, accentVel = 1, ghostVel = 0.4 } = {}) {
  const out = [];
  const s = str.replace(/[\s|]/g, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === 'x') out.push({ step: i, vel });
    else if (c === 'X') out.push({ step: i, vel: accentVel });
    else if (c === 'o') out.push({ step: i, vel: ghostVel });
  }
  return out;
}
