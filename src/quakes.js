// Earthquake details for news rounds written BEFORE v5.3 added the quake field,
// so replays of those days play as earthquake rounds too (chip, rings, the USGS
// line). NEWS is append-only and is never edited; this overlay is applied only
// when a round is shown, so it cannot change any deal. Numbers are USGS's
// reviewed figures (looked up 2026-11-26 by time window and distance), which can
// differ slightly from the first reports quoted in an entry's fact.
export const PAST_QUAKES = {
  'Loyalty Islands, New Caledonia': { pn: 69, quake: { mag: 6.7, depthKm: 10, time: '2026-09-25T21:23:03.906Z', usgs: 'us6000txpi' } },
  'Sola, Vanuatu': { pn: 97, quake: { mag: 6.8, depthKm: 16, time: '2026-10-24T02:31:28.880Z', usgs: 'us6000u4j2' } },
  'Tonosí, Panama': { pn: 104, quake: { mag: 5.2, depthKm: 10, time: '2026-10-31T15:50:18.484Z', usgs: 'us7000tujf' } },
};

// The quake behind a round: its own field (v5.3+), else the overlay for a past news round.
export const quakeFor = (loc) => loc?.quake || (loc?.isNews && PAST_QUAKES[loc.name]?.quake) || null;
