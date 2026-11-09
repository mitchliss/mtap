// WAV writer/reader (PCM 16/24-bit). 16-bit output uses TPDF dither.
import fs from 'node:fs';
import { Rng } from './core/util.js';

export function writeWav(path, L, R, sr = 44100, bits = 24) {
  const n = L.length, ch = 2, bps = bits / 8, dataLen = n * ch * bps;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * bps, 28); buf.writeUInt16LE(ch * bps, 32); buf.writeUInt16LE(bits, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  let o = 44, clipped = 0;
  const r = new Rng('dither');
  if (bits === 24) {
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
      let v = Math.round((c ? R[i] : L[i]) * 8388607);
      if (v > 8388607) { v = 8388607; clipped++; } else if (v < -8388608) { v = -8388608; clipped++; }
      buf.writeIntLE(v, o, 3); o += 3;
    }
  } else if (bits === 16) {
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
      let v = Math.round((c ? R[i] : L[i]) * 32767 + (r.float() - r.float()));
      if (v > 32767) { v = 32767; clipped++; } else if (v < -32768) { v = -32768; clipped++; }
      buf.writeInt16LE(v, o); o += 2;
    }
  } else throw new Error('bits must be 16 or 24');
  fs.writeFileSync(path, buf);
  return { bytes: buf.length, clipped };
}

/** read a PCM WAV (16/24-bit) -> { sr, L, R } */
export function readWav(path) {
  const b = fs.readFileSync(path);
  let p = 12, fmt = null;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4), len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') {
      const bps = fmt.bits / 8, n = len / (bps * fmt.ch), L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) {
        const o = p + 8 + (i * fmt.ch + c) * bps;
        const v = bps === 3 ? b.readIntLE(o, 3) / 8388608 : b.readInt16LE(o) / 32768;
        if (c === 0) L[i] = v; else R[i] = v;
      }
      if (fmt.ch === 1) R.set(L);
      return { sr: fmt.sr, L, R };
    }
    p += 8 + len + (len & 1);
  }
  throw new Error('no data chunk');
}
