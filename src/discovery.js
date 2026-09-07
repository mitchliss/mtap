import { distanceKm, toRad, toDeg, formatDistance } from './geo.js';

export function bearingWord(from, to) {
  const a = toRad(from.lat), b = toRad(to.lat), d = toRad(to.lng - from.lng);
  const angle = (toDeg(Math.atan2(Math.sin(d) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d))) + 360) % 360;
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(angle / 45) % 8];
}
export function guessRelationship(guess, target, miles = false) {
  const distance = distanceKm(guess.lat, guess.lng, target.lat, target.lng);
  if (distance < 1) return 'Your pin landed within 1 km of the destination.';
  if (distance > 19900) return 'Your pin landed almost on the opposite side of Earth.';
  return `Your pin was ${formatDistance(distance, miles)} ${bearingWord(target, guess)} of the destination.`;
}
export function nearbyCities(target, cities, limit = 3) {
  return cities.map((city) => ({ ...city, distance: distanceKm(target.lat, target.lng, city.lat, city.lng) }))
    .filter((city) => city.distance < 900).sort((a, b) => a.distance - b.distance).slice(0, limit);
}
export function shortStory(extract) {
  const sentences = extract.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  const text = sentences?.slice(0, 2).join('').trim() || extract;
  return text.length > 440 ? text.slice(0, 437).replace(/\s+\S*$/, '') + '…' : text;
}
