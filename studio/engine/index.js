// The engine namespace handed to parts as `studio.engine`. See API.md.
import * as util from './core/util.js';
import * as osc from './core/osc.js';
import * as env from './core/env.js';
import * as filters from './core/filters.js';
import * as mod from './core/mod.js';
import * as voices from './core/voices.js';
import * as theory from './theory.js';
import * as fx from './fx/index.js';
import { AcousticGuitar, ElectricGuitar, GuitarPerformance, stringLoop } from './inst/guitar.js';
import { EPiano, Piano } from './inst/keys.js';
import { Strings } from './inst/strings.js';
import { Voice, Choir, parseSyllable } from './inst/voice.js';
import { DrumKit, DrumVoice, DRUM_MIDI } from './inst/drums.js';
import { Synth, Bell, SYNTH_PRESETS } from './inst/synth.js';
import { Riser, Downlifter, Impact, ReverseCymbal, Sweep } from './inst/sfx.js';
import { lufs } from './analysis/loudness.js';
import { truePeak } from './fx/oversample.js';

export const inst = { AcousticGuitar, ElectricGuitar, GuitarPerformance, EPiano, Piano, Strings, Voice, Choir, DrumKit, DrumVoice, Synth, Bell, DRUM_MIDI, SYNTH_PRESETS, stringLoop, parseSyllable };
export const sfx = { Riser, Downlifter, Impact, ReverseCymbal, Sweep };

export const engine = {
  // constants & most-used helpers at top level
  SR: util.SR,
  midiToHz: util.midiToHz, hzToMidi: util.hzToMidi, dbToGain: util.dbToGain, gainToDb: util.gainToDb, noteToMidi: util.noteToMidi,
  clamp: util.clamp, lerp: util.lerp, rng: util.rng, Rng: util.Rng, panGains: util.panGains,
  mono: util.mono, stereo: util.stereo, mixInto: util.mixInto, toStereo: util.toStereo, varispeed: util.varispeed, reverse: util.reverse,
  fadeIn: util.fadeIn, fadeOut: util.fadeOut, normalize: util.normalize, peak: util.peak, rms: util.rms, tanh: util.tanhFast,
  // namespaces
  util, osc, env, filter: filters, mod, voices, groove: voices, theory, fx, inst, sfx,
  analysis: { lufs, truePeak },
};
export default engine;
