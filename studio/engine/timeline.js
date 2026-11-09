// Score resolution: sections -> absolute times (with linear-in-beats tempo ramps), anthem melody notes, chords.
import { parseChord, transposeChord } from './theory.js';
import { noteValueBeats } from './core/util.js';

const STEPS_PER_BAR = 16;

/** Tempo map. Tempo ramps are linear in BEATS across a section (like DAW tempo automation drawn on the arrangement). */
export class Timeline {
  constructor(secs) {
    this.secs = secs; // [{ startBeat, beats, bpm0, bpm1, start }]
    const last = secs[secs.length - 1];
    this.endBeat = last.startBeat + last.beats;
    this.end = last.start + secDur(last);
  }
  _segForBeat(b) { let s = this.secs[0]; for (const x of this.secs) { if (b >= x.startBeat) s = x; else break; } return s; }
  _segForSec(t) { let s = this.secs[0]; for (const x of this.secs) { if (t >= x.start) s = x; else break; } return s; }
  /** seconds at a global beat position (quarter notes from song start). Extrapolates before 0 / after the end. */
  beatToSec(beat) {
    if (beat <= 0) return (beat * 60) / this.secs[0].bpm0;
    if (beat >= this.endBeat) { const l = this.secs[this.secs.length - 1]; return this.end + ((beat - this.endBeat) * 60) / l.bpm1; }
    const s = this._segForBeat(beat), b = beat - s.startBeat;
    return s.start + localSec(s, b);
  }
  secToBeat(t) {
    if (t <= 0) return (t * this.secs[0].bpm0) / 60;
    if (t >= this.end) { const l = this.secs[this.secs.length - 1]; return this.endBeat + ((t - this.end) * l.bpm1) / 60; }
    const s = this._segForSec(t), x = t - s.start;
    if (s.bpm0 === s.bpm1) return s.startBeat + (x * s.bpm0) / 60;
    const k = (s.bpm1 - s.bpm0) / s.beats;
    return s.startBeat + (s.bpm0 / k) * (Math.exp((x * k) / 60) - 1);
  }
  bpmAt(t) {
    if (t <= 0) return this.secs[0].bpm0;
    if (t >= this.end) return this.secs[this.secs.length - 1].bpm1;
    const s = this._segForSec(t), b = this.secToBeat(t) - s.startBeat;
    return s.bpm0 + ((s.bpm1 - s.bpm0) * b) / s.beats;
  }
  barToSec(bar) { return this.beatToSec(bar * 4); }
  stepToSec(step) { return this.beatToSec(step / 4); }
  secToStep(t) { return this.secToBeat(t) * 4; }
  /** duration in seconds of a note value ('1/8', '1/4d', 0.5 beats) starting at time t (follows ramps) */
  noteLen(value, t = 0) { const b = this.secToBeat(t); return this.beatToSec(b + noteValueBeats(value)) - this.beatToSec(b); }
}
function localSec(s, b) {
  if (s.bpm0 === s.bpm1) return (60 * b) / s.bpm0;
  const k = (s.bpm1 - s.bpm0) / s.beats;
  return (60 / k) * Math.log(1 + (k * b) / s.bpm0);
}
function secDur(s) { return localSec(s, s.beats); }

/**
 * Resolve a score against the anthem data. Returns { sections, timeline, melodyNotes, chords }.
 * anthem: { melody: [[midi, len16]...], chords: [40 half-bar symbols], bars: 20 }
 */
export function resolveScore(score, anthem) {
  if (!score || !Array.isArray(score.sections) || !score.sections.length) throw new Error('score.sections must be a non-empty array');
  const names = new Set();
  let bar = 0, t = 0;
  const raw = [];
  for (const [i, s] of score.sections.entries()) {
    if (!s.name) throw new Error(`section ${i} has no name`);
    if (names.has(s.name)) throw new Error(`duplicate section name ${s.name}`);
    names.add(s.name);
    const bars = s.bars;
    if (!(bars > 0)) throw new Error(`section ${s.name}: bars must be > 0`);
    const [bpm0, bpm1] = Array.isArray(s.bpm) ? s.bpm : [s.bpm, s.bpm];
    if (!(bpm0 > 0 && bpm1 > 0)) throw new Error(`section ${s.name}: bad bpm`);
    const seg = { startBeat: bar * 4, beats: bars * 4, bpm0, bpm1, start: t };
    const dur = secDur(seg);
    raw.push({ s, seg, bar, dur, i });
    bar += bars; t += dur;
  }
  const timeline = new Timeline(raw.map((r) => r.seg));
  const sections = raw.map(({ s, seg, bar: startBar, dur, i }) => {
    const transpose = s.transpose || 0;
    const mel = s.melody ? { fromBar: s.melody.fromBar ?? 0, bars: Math.min(s.melody.bars ?? s.bars, s.bars), octave: s.melody.octave ?? 0 } : null;
    const chordFrom = s.chordsFromBar ?? mel?.fromBar ?? 0;
    const halfBars = s.bars * 2;
    const chords = [];
    for (let h = 0; h < halfBars; h++) {
      const sym = Array.isArray(s.chords) && s.chords.length ? s.chords[h % s.chords.length] : anthem.chords[(chordFrom * 2 + h) % anthem.chords.length];
      chords.push(transposeChord(sym, transpose));
    }
    const sec = {
      name: s.name, index: i, role: s.role || 'verse', energy: s.energy ?? 0.5, notes: s.notes || '', transpose,
      bars: s.bars, bpm: s.bpm, bpm0: seg.bpm0, bpm1: seg.bpm1, melody: mel, chords,
      startBar, endBar: startBar + s.bars, startBeat: seg.startBeat, endBeat: seg.startBeat + seg.beats,
      startStep: startBar * STEPS_PER_BAR, endStep: (startBar + s.bars) * STEPS_PER_BAR,
      start: seg.start, end: seg.start + dur, dur, extra: s,
    };
    /** seconds of (bar, beat) relative to this section (fractional ok) */
    sec.at = (b = 0, beat = 0) => timeline.beatToSec(sec.startBeat + b * 4 + beat);
    /** seconds of the n-th 16th step of this section */
    sec.step = (n) => timeline.stepToSec(sec.startStep + n);
    /** seconds of the n-th beat of this section */
    sec.beat = (n) => timeline.beatToSec(sec.startBeat + n);
    sec.contains = (time) => time >= sec.start && time < sec.end;
    return sec;
  });
  // melody
  const anthemNotes = [];
  let st = 0;
  anthem.melody.forEach(([midi, len], idx) => { anthemNotes.push({ midi, step: st, len, idx }); st += len; });
  const melodyNotes = [];
  for (const sec of sections) {
    if (!sec.melody) continue;
    const { fromBar, bars, octave } = sec.melody;
    for (let k = 0; k < bars; k++) {
      const ab = (fromBar + k) % anthem.bars;
      for (const an of anthemNotes) {
        if (an.step < ab * 16 || an.step >= ab * 16 + 16) continue;
        const local = k * 16 + (an.step - ab * 16);
        const endLocal = Math.min(local + an.len, bars * 16);
        if (endLocal <= local) continue;
        const gs = sec.startStep + local, ge = sec.startStep + endLocal;
        const time = timeline.stepToSec(gs), end = timeline.stepToSec(ge);
        melodyNotes.push({
          midi: an.midi + sec.transpose + 12 * octave, time, end, dur: end - time, step: gs, steps: endLocal - local,
          sectionStep: local, section: sec.name, sectionIndex: sec.index, anthemBar: ab, anthemIndex: an.idx, anthemStep: an.step, vel: 1,
        });
      }
    }
  }
  // chords (absolute)
  const chords = [];
  for (const sec of sections) {
    sec.chords.forEach((sym, h) => {
      const c = parseChord(sym);
      const start = timeline.beatToSec(sec.startBeat + h * 2), end = timeline.beatToSec(sec.startBeat + h * 2 + 2);
      chords.push({ ...c, symbol: sym, start, end, section: sec.name, sectionIndex: sec.index, halfBar: sec.startBar * 2 + h, bar: sec.startBar + Math.floor(h / 2) });
    });
  }
  return { sections, timeline, melodyNotes, chords };
}
