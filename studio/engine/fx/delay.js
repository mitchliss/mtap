// Tempo-synced stereo / ping-pong delay with filtered, saturated, modulated feedback.
import { SR, noteValueBeats, dbToGain } from '../core/util.js';
import { Biquad } from '../core/filters.js';
import { shaper } from './saturation.js';

/**
 * cfg: { time (s) | sync: '1/8d' (beats via timeline, follows tempo ramps), syncR (optional different right time),
 *        feedback=0.35, mix=1 (1 = wet only, for send/return use), dry (override), pingpong=false,
 *        hp=300, lp=6000 (feedback-path filters), mod=0.08 (ms of wow), drive=0 (dB saturation in loop),
 *        width=1, spread=0 (ms extra on right for stereo mode), timeline }
 */
export class Delay {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr; this.tl = cfg.timeline;
    this.syncL = cfg.sync ? noteValueBeats(cfg.sync) : 0; this.syncR = cfg.syncR ? noteValueBeats(cfg.syncR) : this.syncL;
    this.timeL = cfg.time ?? 0.375; this.timeR = cfg.timeR ?? this.timeL;
    this.fb = cfg.feedback ?? 0.35; this.mix = cfg.mix ?? 1; this.dry = cfg.dry ?? (this.mix >= 1 ? 0 : 1 - this.mix);
    this.pp = !!cfg.pingpong; this.spread = ((cfg.spread ?? 0) / 1000) * sr;
    this.N = Math.ceil(4.2 * sr); this.buf = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0;
    this.hp = [new Biquad('hp', cfg.hp ?? 300, 0.6, 0, sr), new Biquad('hp', cfg.hp ?? 300, 0.6, 0, sr)];
    this.lp = [new Biquad('lp', cfg.lp ?? 6000, 0.6, 0, sr), new Biquad('lp', cfg.lp ?? 6000, 0.6, 0, sr)];
    this.mod = ((cfg.mod ?? 0.08) / 1000) * sr; this.mph = 0;
    this.sat = cfg.drive ? shaper('tanh', dbToGain(cfg.drive)) : null;
    this.width = cfg.width ?? 1;
    this.dL = -1; this.dR = -1;
  }
  targetDelays(t) {
    let a, b;
    if (this.syncL && this.tl) { const spb = 60 / this.tl.bpmAt(t); a = this.syncL * spb; b = this.syncR * spb; }
    else { a = this.timeL; b = this.timeR; }
    return [Math.min(4, a) * this.sr, Math.min(4, b) * this.sr + this.spread];
  }
  process(L, R, start = 0, end = L.length, frame0 = 0) {
    // sub-blocks keep the in-loop filtering valid for any call size
    for (let s = start; s < end; s += 256) this._block(L, R, s, Math.min(end, s + 256), frame0 + (s - start));
  }
  _block(L, R, start, end, frame0) {
    const N = this.N, [bL, bR] = this.buf, sr = this.sr, fb = this.fb;
    const [tL, tR] = this.targetDelays(frame0 / sr);
    if (this.dL < 0) { this.dL = tL; this.dR = tR; }
    const k = 0.9995;
    for (let i = start; i < end; i++) {
      this.dL = this.dL * k + tL * (1 - k); this.dR = this.dR * k + tR * (1 - k);
      const m = this.mod * Math.sin(2 * Math.PI * this.mph); this.mph += 0.4 / sr; if (this.mph > 1) this.mph -= 1;
      let rl = this.w - this.dL - m, rr = this.w - this.dR + m;
      while (rl < 0) rl += N; while (rr < 0) rr += N;
      const il = rl | 0, fl = rl - il, ir = rr | 0, fr = rr - ir;
      let oL = bL[il] + (bL[(il + 1) % N] - bL[il]) * fl;
      let oR = bR[ir] + (bR[(ir + 1) % N] - bR[ir]) * fr;
      const inL = L[i], inR = R[i];
      let wL, wR;
      if (this.pp) { wL = (inL + inR) * 0.5 + oR * fb; wR = oL * fb; }
      else { wL = inL + oL * fb; wR = inR + oR * fb; }
      if (this.sat) { wL = this.sat(wL); wR = this.sat(wR); }
      bL[this.w] = wL; bR[this.w] = wR;
      if (this.width !== 1) { const mm = (oL + oR) * 0.5, ss = (oL - oR) * 0.5 * this.width; oL = mm + ss; oR = mm - ss; }
      L[i] = inL * this.dry + oL * this.mix; R[i] = inR * this.dry + oR * this.mix;
      this.w = (this.w + 1) % N;
    }
    // feedback filters (applied on the written block -> in the loop, one block late is inaudible for >20ms delays)
    const s = this.w - (end - start);
    if (s >= 0) { for (let c = 0; c < 2; c++) { this.hp[c].process(this.buf[c], s, this.w); this.lp[c].process(this.buf[c], s, this.w); } }
    else {
      for (let c = 0; c < 2; c++) { this.hp[c].process(this.buf[c], s + N, N); this.lp[c].process(this.buf[c], s + N, N); this.hp[c].process(this.buf[c], 0, this.w); this.lp[c].process(this.buf[c], 0, this.w); }
    }
  }
}
