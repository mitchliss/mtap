// Nature rounds (v5.6): the words players see. Pure, so Node tests can check them.
import { formatDistance } from './geo.js';
import { bearingWord } from './discovery.js';

const KIND = {
  mountains: ['⛰️', 'Mountains'], desert: ['🏜️', 'Desert'], sea: ['🌊', 'Sea'], gulf: ['🌊', 'Gulf or bay'],
  strait: ['⚓', 'Strait'], peninsula: ['🗺️', 'Peninsula'], island: ['🏝️', 'Island'], plateau: ['🏔️', 'Plateau'],
  delta: ['🌿', 'River delta'], valley: ['🏞️', 'Valley'], wetland: ['🌿', 'Wetland'], lakes: ['💧', 'Lakes'],
  reef: ['🐠', 'Reef'], region: ['🧭', 'Region'],
};
export const kindChip = (kind) => { const [e, w] = KIND[kind] || KIND.region; return `${e} Nature round · ${w}`; };
export const promptLabelFor = (f) => (['sea', 'gulf', 'strait', 'reef'].includes(f.kind)
  ? 'Tap anywhere on this water…' : 'Tap anywhere on it…');

// "the Zagros Mountains" reads better mid-sentence; a few names take no "the".
const NO_THE = new Set(['Borneo', 'Tasmania', 'Sicily', 'Crete', 'Anatolia', 'Mesopotamia', 'Patagonia', 'Hadhramaut',
  'Garabogazköl', 'Salar de Uyuni', 'Chesapeake Bay', 'Hudson Bay', 'Prince William Sound', 'Baja California']);
export const theName = (name) => (NO_THE.has(name) ? name : `the ${name.replace(/^The /, '')}`);

export function featureResultLine(result, miles = false) {
  const name = theName(result.target.name);
  if (result.distanceKm <= 0.5) return `🎯 Your pin landed right inside ${name}!`;
  return `Your pin was ${formatDistance(result.distanceKm, miles)} from the edge of ${name}.`;
}

export function featureVerdict(result, miles = false) {
  const name = theName(result.target.name);
  const d = formatDistance(result.distanceKm, miles);
  if (result.distanceKm <= 0.5) return `🎯 Inside ${name} - full marks!`;
  if (result.score >= 85) return `🔥 So close - just ${d} from the edge of ${name}.`;
  if (result.score >= 55) return `👍 Not far - ${name} starts ${d} from your pin.`;
  return `🌍 ${name[0].toUpperCase() + name.slice(1)} is ${d} away - now you know where it is!`;
}

// Where the nearest edge lies from the pin ("230 km northeast of your pin").
export function edgeDirection(guess, edge) {
  return edge ? bearingWord(guess, edge) : '';
}

// The Wikipedia title for a feature: drop a "(...)" note we added for players.
export const wikiTitleFor = (f) => f.name.replace(/\s*\([^)]*\)\s*$/, '');
