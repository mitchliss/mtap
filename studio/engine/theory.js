// Music theory: chord symbols, transposition, voicings (keyboard + guitar), scales, arpeggios.

const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const QUALITIES = {
  '': [0, 4, 7], maj: [0, 4, 7], M: [0, 4, 7], m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7],
  5: [0, 7], dim: [0, 3, 6], aug: [0, 4, 8], '+': [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], mmaj7: [0, 3, 7, 11], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  '7sus4': [0, 5, 7, 10], '7sus2': [0, 2, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], add2: [0, 2, 4, 7], madd2: [0, 2, 3, 7],
  add4: [0, 4, 5, 7], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], '7b9': [0, 4, 7, 10, 13],
  11: [0, 4, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17], 13: [0, 4, 7, 10, 14, 21], 69: [0, 4, 7, 9, 14], m69: [0, 3, 7, 9, 14],
};

export function pcName(pc) { return PC_NAMES[((pc % 12) + 12) % 12]; }

function parseRoot(s) {
  const m = /^([A-G])([#b]?)/.exec(s);
  if (!m) return null;
  return { pc: (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, len: m[0].length };
}

const chordCache = new Map();
/**
 * Parse a chord symbol: 'Dm', 'Bbmaj7', 'A7', 'Csus4', 'F/A', 'Gm7/F'.
 * Returns { symbol, root (pc), bass (pc), quality, intervals, pcs } (pcs in interval order, mod 12).
 */
export function parseChord(sym) {
  if (chordCache.has(sym)) return chordCache.get(sym);
  const [main, slash] = String(sym).trim().split('/');
  const r = parseRoot(main);
  if (!r) throw new Error(`bad chord symbol ${sym}`);
  const quality = main.slice(r.len);
  const intervals = QUALITIES[quality];
  if (!intervals) throw new Error(`unknown chord quality "${quality}" in ${sym}`);
  const bassR = slash ? parseRoot(slash) : null;
  const c = Object.freeze({
    symbol: sym, root: r.pc, bass: bassR ? bassR.pc : r.pc, quality, intervals,
    pcs: intervals.map((i) => (r.pc + i) % 12),
    minor: intervals.includes(3) && !intervals.includes(4),
  });
  chordCache.set(sym, c);
  return c;
}

/** transpose a chord symbol by semitones (spelled with common pop spellings) */
export function transposeChord(sym, semis) {
  if (!semis) return sym;
  const c = parseChord(sym);
  const root = pcName(c.root + semis);
  const slash = c.bass !== c.root ? '/' + pcName(c.bass + semis) : '';
  return root + c.quality + slash;
}

/** root-position chord tones as midi, root in the given octave (C4 = 60) */
export function chordNotes(chord, octave = 4) {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const base = 12 * (octave + 1) + c.root;
  return c.intervals.map((i) => base + i);
}

/** lowest midi >= lo with the given pitch class */
export function pcAtOrAbove(pc, lo) { return lo + ((((pc - lo) % 12) + 12) % 12); }

/**
 * Keyboard voicing.
 * opts: { style: 'close'|'open'|'spread'|'pad'|'stab'|'drop2'|'power',
 *         low=55, high=79 (range for upper voices), voices=4, prev (previous voicing midi[] for voice leading),
 *         bass: false|octave number (adds bass note in that octave), center }
 * 'close' voice-leads from prev when given, else centres the chord around `center` (default middle of range).
 */
export function voicing(chord, opts = {}) {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const style = opts.style || 'close';
  const low = opts.low ?? 55, high = opts.high ?? 79;
  let out;
  if (style === 'close' || style === 'drop2') {
    const count = opts.voices ?? Math.max(3, c.pcs.length);
    out = voiceLead(c, opts.prev, { low, high, count, center: opts.center });
    if (style === 'drop2' && out.length >= 4) { const s = out.slice().sort((a, b) => a - b); s[s.length - 2] -= 12; out = s.sort((a, b) => a - b); }
  } else if (style === 'spread' || style === 'pad') {
    // root + fifth low, then 3rd/7th/9th/5th spread above
    const r = pcAtOrAbove(c.root, low - 12 > 36 ? low - 12 : 40);
    const ups = c.intervals.slice(1).map((i) => (c.root + i) % 12);
    out = [r, r + 7];
    let cur = r + 12;
    for (const pc of ups) { const m = pcAtOrAbove(pc, cur); out.push(m); cur = m + (style === 'pad' ? 3 : 1); }
    out = out.filter((m) => m <= high + 12);
  } else if (style === 'stab') {
    const r = pcAtOrAbove(c.root, low);
    const third = c.intervals.find((i) => i === 3 || i === 4) ?? c.intervals[1];
    out = [r, r + 7, r + 12, r + 12 + third, r + 19];
  } else if (style === 'power') {
    const r = pcAtOrAbove(c.root, low);
    out = [r, r + 7, r + 12];
  } else throw new Error(`voicing style ${style}?`);
  if (opts.bass !== undefined && opts.bass !== false) {
    const b = 12 * (opts.bass + 1) + c.bass;
    out = [b, ...out.filter((m) => m > b)];
  }
  return out.sort((a, b) => a - b);
}

/**
 * Minimal-movement voicing of `count` notes within [low, high] containing the chord's essential tones.
 * prev: previous voicing (midi array) or undefined.
 */
export function voiceLead(chord, prev, { low = 55, high = 79, count = 4, center } = {}) {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const cands = [];
  const pcs = c.pcs;
  const avail = [];
  for (let m = low; m <= high; m++) if (pcs.includes(m % 12)) avail.push(m);
  const target = center ?? (low + high) / 2;
  const essential = new Set(pcs.filter((pc, i) => !(c.intervals[i] === 7 && pcs.length > 3)));
  const rec = (start, acc) => {
    if (acc.length === count) { cands.push(acc.slice()); return; }
    for (let i = start; i < avail.length; i++) {
      if (acc.length && avail[i] - acc[acc.length - 1] > 9) break;
      acc.push(avail[i]); rec(i + 1, acc); acc.pop();
    }
  };
  rec(0, []);
  let best = null, bestScore = Infinity;
  for (const v of cands) {
    const set = new Set(v.map((m) => m % 12));
    let miss = 0; for (const pc of essential) if (!set.has(pc)) miss++;
    if (miss > Math.max(0, count < essential.size ? essential.size - count : 0)) continue;
    let score = miss * 6;
    const thirdPc = c.pcs[c.intervals.findIndex((i) => i === 3 || i === 4)];
    if (thirdPc !== undefined && v.filter((m) => m % 12 === thirdPc).length > 1) score += 4; // doubled 3rd
    if (prev && prev.length) {
      const sp = prev.slice().sort((a, b) => a - b);
      for (let i = 0; i < v.length; i++) score += Math.abs(v[i] - sp[Math.min(i, sp.length - 1)]) * 0.6;
    } else {
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      score += Math.abs(mean - target) * 0.5;
    }
    if (v[v.length - 1] - v[0] > 14) score += 2;
    if (score < bestScore) { bestScore = score; best = v; }
  }
  return best || chordNotes(c, 4).slice(0, count);
}

// ---------------------------------------------------------------------------
// Guitar voicings (standard tuning)
// ---------------------------------------------------------------------------
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64];
const gtrCache = new Map();
/**
 * Realistic guitar chord shape. Returns 6 entries low E..high E: midi or null (muted).
 * opts: { prefer: 'open'|'barre'|'high', maxFret=12, minStrings=4, capo=0, tuning }
 */
export function guitarVoicing(chord, opts = {}) {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const prefer = opts.prefer || 'open', capo = opts.capo || 0, tuning = opts.tuning || GUITAR_TUNING;
  const key = `${c.symbol}|${prefer}|${capo}|${opts.maxFret ?? 12}|${tuning.join(',')}`;
  if (gtrCache.has(key)) return gtrCache.get(key).slice();
  const maxFret = opts.maxFret ?? 12, minStrings = opts.minStrings ?? 4;
  const pcs = new Set(c.pcs);
  let best = null, bestScore = Infinity;
  for (let pos = capo; pos <= maxFret; pos++) {
    const options = tuning.map((open) => {
      const o = [null];
      const frets = [capo, ...Array.from({ length: 4 }, (_, k) => pos + k)].filter((f, i, a) => f >= capo && a.indexOf(f) === i);
      for (const f of frets) if (pcs.has((open + f) % 12)) o.push(f);
      return o;
    });
    const fr = new Array(6);
    const rec = (s) => {
      if (s === 6) { const sc = scoreShape(fr, tuning, c, pos, capo, prefer, minStrings); if (sc < bestScore) { bestScore = sc; best = fr.slice(); } return; }
      for (const f of options[s]) { fr[s] = f; rec(s + 1); }
    };
    rec(0);
  }
  const res = best ? best.map((f, s) => (f === null ? null : tuning[s] + f)) : chordNotes(c, 3);
  gtrCache.set(key, res);
  return res.slice();
}

function scoreShape(fr, tuning, c, pos, capo, prefer, minStrings) {
  const played = [];
  for (let s = 0; s < 6; s++) if (fr[s] !== null) played.push(s);
  if (played.length < minStrings) return Infinity;
  // inner mutes are awkward
  let inner = 0;
  for (let s = played[0]; s <= played[played.length - 1]; s++) if (fr[s] === null) inner++;
  if (inner > 1) return Infinity;
  const notes = played.map((s) => tuning[s] + fr[s]);
  if (notes[0] % 12 !== c.bass) return Infinity;
  let unison = 0;
  for (let i = 1; i < notes.length; i++) { if (notes[i] < notes[i - 1]) return Infinity; if (notes[i] === notes[i - 1]) unison++; }
  const have = new Set(notes.map((n) => n % 12));
  let missing = 0;
  c.pcs.forEach((pc, i) => { if (!have.has(pc)) missing += c.intervals[i] === 7 ? 0.8 : 10; });
  if (missing >= 10) return Infinity;
  const fretted = played.map((s) => fr[s]).filter((f) => f > capo);
  const minF = fretted.length ? Math.min(...fretted) : capo, maxF = fretted.length ? Math.max(...fretted) : capo;
  if (maxF - minF > 3) return Infinity;
  const atMin = fretted.filter((f) => f === minF).length;
  const fingers = fretted.length - (atMin > 1 ? atMin - 1 : 0);
  if (fingers > 4) return Infinity;
  const opens = played.filter((s) => fr[s] === capo).length;
  let score = missing + inner * 4 + (6 - played.length) * 1.2 + unison * 3;
  if (prefer === 'open') score += minF * 0.6 - opens * 0.4;
  else if (prefer === 'barre') score += Math.abs(minF - 5) * 0.3 + opens * 0.8;
  else if (prefer === 'high') score += Math.abs(minF - 7) * 0.4 + (played[0] < 2 ? 3 : 0);
  // doubled 3rd penalty, root on top bonus-ish
  const third = c.pcs[c.intervals.findIndex((i) => i === 3 || i === 4)];
  if (third !== undefined && notes.filter((n) => n % 12 === third).length > 1) score += 0.7;
  void pos;
  return score;
}

// ---------------------------------------------------------------------------
// Scales & arpeggios
// ---------------------------------------------------------------------------
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], pentMinor: [0, 3, 5, 7, 10], pentMajor: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10], freygish: [0, 1, 4, 5, 7, 8, 10],
};
/** pitch classes of a scale. root: pc number or name ('D') */
export function scale(root, mode = 'minor') {
  const r = typeof root === 'number' ? root : parseRoot(root).pc;
  return SCALES[mode].map((i) => (r + i) % 12);
}
/** snap midi to nearest pitch in pcs (ties go down) */
export function snap(midi, pcs) {
  for (let d = 0; d < 12; d++) { if (pcs.includes(((midi - d) % 12 + 12) % 12)) return midi - d; if (pcs.includes((midi + d) % 12)) return midi + d; }
  return midi;
}
/**
 * Arpeggio sequence from chord notes. pattern: 'up'|'down'|'updown'|'downup'|'converge'|'random'|number[] (indices),
 * steps: how many notes to produce, octaves: span. Returns midi[].
 */
export function arpeggio(notes, pattern = 'up', steps = 8, { octaves = 1, seed = 1 } = {}) {
  const base = notes.slice().sort((a, b) => a - b);
  const pool = [];
  for (let o = 0; o < octaves; o++) for (const n of base) pool.push(n + 12 * o);
  let seq;
  if (Array.isArray(pattern)) seq = pattern.map((i) => pool[((i % pool.length) + pool.length) % pool.length]);
  else if (pattern === 'up') seq = pool;
  else if (pattern === 'down') seq = pool.slice().reverse();
  else if (pattern === 'updown') seq = pool.concat(pool.slice(1, -1).reverse());
  else if (pattern === 'downup') { const d = pool.slice().reverse(); seq = d.concat(d.slice(1, -1).reverse()); }
  else if (pattern === 'converge') { seq = []; let a = 0, b = pool.length - 1; while (a <= b) { seq.push(pool[a++]); if (a <= b) seq.push(pool[b--]); } }
  else if (pattern === 'random') { let s = seed; seq = pool.map(() => { s = (s * 16807) % 2147483647; return pool[s % pool.length]; }); }
  else throw new Error(`arp pattern ${pattern}?`);
  const out = [];
  for (let i = 0; i < steps; i++) out.push(seq[i % seq.length]);
  return out;
}
