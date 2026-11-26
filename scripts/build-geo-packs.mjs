// Build the v5.4 place packs from the vendored God's Eye View data (run after
// `git submodule update --init vendor/gods-eye-view`; the outputs are committed, so
// the game and CI never need the submodule):
//
//   public/data/admin1/<ISO2>.json  states / provinces per country (Natural Earth,
//                                    public domain) - loaded only for the country
//                                    a pin or an answer is in.
//   public/data/cities/<r>_<c>.json  31,827 cities of 15,000+ people (Wikidata, CC0),
//                                    in 10-degree tiles - the answer card loads the
//                                    3x3 tiles around the destination.
//
// Usage: node scripts/build-geo-packs.mjs
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'vendor/gods-eye-view/src/data/local_data');
// One tile key for the build and the game, so they can never disagree.
import { CITY_TILE_DEG, cityTileKey } from '../src/places.js';

async function admin1() {
  const pack = JSON.parse(await readFile(path.join(src, 'natural_earth/states_provinces.json'), 'utf8'));
  const decimals = pack.meta?.decimals ?? 3;
  const byIso = new Map();
  for (const f of pack.features) {
    if (!f.iso2 || !/^[A-Z]{2}$/.test(f.iso2) || !f.polygons?.length) continue;
    if (!byIso.has(f.iso2)) byIso.set(f.iso2, []);
    // English name where Natural Earth has one; a few regions carry their own precision (d).
    byIso.get(f.iso2).push({ name: f.nameEn || f.name, type: f.type || null, d: f.d ?? decimals, polygons: f.polygons });
  }
  const out = path.join(root, 'public/data/admin1');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  let bytes = 0;
  for (const [iso, regions] of byIso) {
    const json = JSON.stringify({ iso2: iso, decimals, source: 'Natural Earth ne_10m_admin_1_states_provinces (public domain), via gods-eye-view', regions });
    bytes += json.length;
    await writeFile(path.join(out, `${iso}.json`), json);
  }
  return { countries: byIso.size, bytes };
}

async function cities() {
  const pack = JSON.parse(await readFile(path.join(src, 'wikidata_cities/cities.json'), 'utf8'));
  const tiles = new Map();
  for (const [name, lat, lng, population] of pack.rows) {
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = cityTileKey(lat, lng);
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push([name, lat, lng, population || 0]);
  }
  const out = path.join(root, 'public/data/cities');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  let bytes = 0, largest = 0;
  for (const [key, rows] of tiles) {
    const json = JSON.stringify(rows);
    bytes += json.length; largest = Math.max(largest, json.length);
    await writeFile(path.join(out, `${key}.json`), json);
  }
  await writeFile(path.join(out, 'README.md'), `# City tiles\n\n${pack.rows.length} cities and towns of ${pack.meta.minPopulation.toLocaleString()}+ people from Wikidata (CC0 1.0), built ${pack.meta.built}, via gods-eye-view.\nOne file per ${CITY_TILE_DEG}-degree tile, \`<row>_<col>.json\`, rows of [name, lat, lng, population], largest first.\nRebuild with \`node scripts/build-geo-packs.mjs\`.\n`);
  return { tiles: tiles.size, bytes, largest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('admin1', await admin1());
  console.log('cities', await cities());
}
