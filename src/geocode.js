// Forward geocoding for family places: type "city, state/country" and the app
// finds the coordinates itself. Primary: Open-Meteo's free geocoding API (no key,
// CORS-enabled, built for public client-side use). Fallback: OpenStreetMap
// Nominatim, which also understands landmarks and street addresses.
// Returns up to 4 candidates as { label, lat, lng }, or null if nothing matched.

export async function geocodePlace(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  // Open-Meteo geocoder (city / region names)
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=4&language=en&format=json`
    );
    if (r.ok) {
      const j = await r.json();
      if (j.results && j.results.length) {
        return j.results.map((x) => ({
          label: [x.name, x.admin1, x.country].filter(Boolean).join(', '),
          lat: x.latitude,
          lng: x.longitude,
        }));
      }
    }
  } catch { /* try fallback */ }

  // Nominatim fallback (landmarks, addresses, "Wrigley Field"-style queries)
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=4&accept-language=en`,
      { headers: { Accept: 'application/json' } }
    );
    if (r.ok) {
      const j = await r.json();
      if (j.length) {
        return j.map((x) => ({
          label: x.display_name.split(',').slice(0, 3).map((s) => s.trim()).join(', '),
          lat: +x.lat,
          lng: +x.lon,
        }));
      }
    }
  } catch { /* give up */ }

  return null;
}

// Population lookup for round results: query the city token from a location's
// display name, then accept only a candidate that's actually near the target
// (within 300 km) so "Paris" never returns Paris, Texas. Cached per name.
import { distanceKm } from './geo.js';

const popCache = new Map();

export async function fetchPopulationNear(name, lat, lng) {
  if (popCache.has(name)) return popCache.get(name);
  let result = null;
  const base = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const tokens = [];
  for (const part of base.split('—')) {
    for (const sub of part.split(',')) {
      const t = sub.trim();
      if (t && !tokens.includes(t)) tokens.push(t);
    }
  }
  for (const q of tokens.slice(0, 3)) {
    try {
      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`
      );
      if (!r.ok) continue;
      const j = await r.json();
      const hit = (j.results || []).find(
        (x) => x.population > 0 && distanceKm(lat, lng, x.latitude, x.longitude) < 300
      );
      if (hit) { result = hit.population; break; }
    } catch { break; /* offline */ }
  }
  popCache.set(name, result);
  return result;
}

export function formatPopulation(n) {
  if (!n) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million';
  return n.toLocaleString();
}

// Reverse geocoding: turn a photo's GPS coordinates into a friendly label
// ("Wilmette, Cook County, Illinois"). Nominatim, zoomed to city level.
export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12&accept-language=en`,
      { headers: { Accept: 'application/json' } }
    );
    if (r.ok) {
      const j = await r.json();
      if (j.display_name) {
        return j.display_name.split(',').slice(0, 3).map((s) => s.trim()).join(', ');
      }
    }
  } catch { /* offline */ }
  return null;
}
