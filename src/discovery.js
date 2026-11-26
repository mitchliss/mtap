import { distanceKm, toRad, toDeg, formatDistance } from './geo.js';

export function bearingWord(from, to) {
  const a = toRad(from.lat), b = toRad(to.lat), d = toRad(to.lng - from.lng);
  const angle = (toDeg(Math.atan2(Math.sin(d) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d))) + 360) % 360;
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(angle / 45) % 8];
}
// pinnedCountry: the resolved country the pin landed in (null for open water /
// unknown). Players asked to always be told which country they actually tapped.
export function guessRelationship(guess, target, miles = false, pinnedCountry = null) {
  const distance = distanceKm(guess.lat, guess.lng, target.lat, target.lng);
  if (distance < 1) return 'Your pin landed within 1 km of the destination.';
  if (distance > 19900) {
    return pinnedCountry
      ? `Your pin landed in ${pinnedCountry} — almost on the opposite side of Earth.`
      : 'Your pin landed almost on the opposite side of Earth.';
  }
  const where = `${formatDistance(distance, miles)} ${bearingWord(target, guess)} of the destination`;
  return pinnedCountry
    ? `Your pin landed in ${pinnedCountry}, ${where}.`
    : `Your pin was ${where}.`;
}
export function nearbyCities(target, cities, limit = 3) {
  return cities.map((city) => ({ ...city, distance: distanceKm(target.lat, target.lng, city.lat, city.lng) }))
    .filter((city) => city.distance < 900).sort((a, b) => a.distance - b.distance).slice(0, limit);
}
// Earthquake rounds (v5.3): the USGS numbers in one line, time in the player's clock.
export const usgsEventUrl = (q) => `https://earthquake.usgs.gov/earthquakes/eventpage/${q.usgs}`;
export function describeQuakeRound(q, locale) {
  const when = new Date(q.time).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const depth = q.depthKm < 70 ? `${Math.round(q.depthKm)} km deep, shallow, so it was felt strongly`
    : q.depthKm < 300 ? `${Math.round(q.depthKm)} km deep` : `${Math.round(q.depthKm)} km deep, very deep, so it was felt gently over a wide area`;
  return `Magnitude ${q.mag.toFixed(1)} earthquake, ${depth}. It struck ${when} your time.`;
}
// Ring size on the globe grows with magnitude (each whole step is ~32x the energy).
export const quakeRingSize = (mag) => Math.min(0.16, Math.max(0.03, 0.05 * Math.pow(1.5, mag - 6)));

export function shortStory(extract) {
  const sentences = extract.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  const text = sentences?.slice(0, 2).join('').trim() || extract;
  return text.length > 440 ? text.slice(0, 437).replace(/\s+\S*$/, '') + '…' : text;
}
