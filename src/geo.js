// Geographic math helpers: distances, point-in-polygon country lookup, formatting.

const EARTH_RADIUS_KM = 6371;

export function toRad(deg) { return (deg * Math.PI) / 180; }
export function toDeg(rad) { return (rad * 180) / Math.PI; }

// Great-circle distance in km (haversine)
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(km, useMiles) {
  if (useMiles) {
    const mi = km * 0.621371;
    if (mi < 10) return `${mi.toFixed(1)} mi`;
    return `${Math.round(mi).toLocaleString()} mi`;
  }
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

// ---- Country lookup (ray-casting point in polygon over Natural Earth GeoJSON) ----

let countryFeatures = null;

export async function loadCountries(url) {
  const res = await fetch(url);
  const geo = await res.json();
  countryFeatures = geo.features.map((f) => ({
    name: f.properties.NAME || f.properties.ADMIN,
    continent: f.properties.CONTINENT,
    iso2: f.properties.ISO_A2_EH || f.properties.ISO_A2,
    geometry: f.geometry,
    bbox: computeBBox(f.geometry),
  }));
  return geo; // raw geojson is also used to paint the globe texture
}

function computeBBox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  forEachRing(geometry, (ring) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  });
  return [minX, minY, maxX, maxY];
}

function forEachRing(geometry, cb) {
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) cb(ring);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) for (const ring of poly) cb(ring);
  }
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lon, lat, outer)) return false;
    for (const hole of holes) if (pointInRing(lon, lat, hole)) return false;
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      const [outer, ...holes] = poly;
      if (pointInRing(lon, lat, outer)) {
        let inHole = false;
        for (const hole of holes) if (pointInRing(lon, lat, hole)) { inHole = true; break; }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

// Returns { name, continent } or null when the point is in the ocean.
export function countryAt(lat, lon) {
  if (!countryFeatures) return null;
  for (const f of countryFeatures) {
    const [minX, minY, maxX, maxY] = f.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (pointInGeometry(lon, lat, f.geometry)) {
      return { name: f.name, continent: f.continent, iso2: f.iso2 };
    }
  }
  return null;
}
