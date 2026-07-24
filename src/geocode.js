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
