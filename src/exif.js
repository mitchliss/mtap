// Minimal EXIF GPS extractor for family-place photos. Reads the GPS coordinates
// embedded in a JPEG's EXIF block (APP1 -> TIFF -> GPS IFD) entirely in the
// browser - the photo itself never leaves the device and is never stored.
// Returns { lat, lng } or null (no GPS data, stripped metadata, non-JPEG, etc).

export async function extractPhotoLocation(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length < 12 || buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not a JPEG

    // Walk JPEG segments looking for APP1/"Exif\0\0"
    let i = 2;
    while (i + 4 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      if (marker === 0xda) break; // start of image data - no EXIF past here
      const size = (buf[i + 2] << 8) + buf[i + 3];
      if (marker === 0xe1 && size >= 14 &&
          buf[i + 4] === 0x45 && buf[i + 5] === 0x78 && // 'E','x'
          buf[i + 6] === 0x69 && buf[i + 7] === 0x66 && // 'i','f'
          buf[i + 8] === 0x00 && buf[i + 9] === 0x00) {
        return parseTiffGps(buf, i + 10, i + 2 + size);
      }
      i += 2 + size;
    }
  } catch { /* unreadable file */ }
  return null;
}

function parseTiffGps(buf, base, end) {
  const inBounds = (o, n) => o >= base && o + n <= end && o + n <= buf.length;
  if (!inBounds(base, 8)) return null;

  const little = buf[base] === 0x49 && buf[base + 1] === 0x49;
  const u16 = (o) => (little ? buf[o] | (buf[o + 1] << 8) : (buf[o] << 8) | buf[o + 1]);
  const u32 = (o) => (little
    ? (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0
    : ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0);

  if (u16(base + 2) !== 42) return null; // TIFF magic

  // IFD0: find the GPS sub-IFD pointer (tag 0x8825)
  const ifd0 = base + u32(base + 4);
  if (!inBounds(ifd0, 2)) return null;
  const entries = u16(ifd0);
  let gpsIfd = 0;
  for (let e = 0; e < entries; e++) {
    const at = ifd0 + 2 + e * 12;
    if (!inBounds(at, 12)) return null;
    if (u16(at) === 0x8825) { gpsIfd = base + u32(at + 8); break; }
  }
  if (!gpsIfd || !inBounds(gpsIfd, 2)) return null;

  // GPS IFD: refs are inline ASCII; coordinates are 3 rationals (deg, min, sec)
  const rational3 = (valOffset) => {
    const o = base + valOffset;
    if (!inBounds(o, 24)) return null;
    const part = (k) => u32(o + k * 8) / (u32(o + k * 8 + 4) || 1);
    return part(0) + part(1) / 60 + part(2) / 3600;
  };

  let latRef = 'N', lngRef = 'E', lat = null, lng = null;
  const gpsEntries = u16(gpsIfd);
  for (let e = 0; e < gpsEntries; e++) {
    const at = gpsIfd + 2 + e * 12;
    if (!inBounds(at, 12)) return null;
    const tag = u16(at);
    if (tag === 0x0001) latRef = String.fromCharCode(buf[at + 8]);
    else if (tag === 0x0002) lat = rational3(u32(at + 8));
    else if (tag === 0x0003) lngRef = String.fromCharCode(buf[at + 8]);
    else if (tag === 0x0004) lng = rational3(u32(at + 8));
  }
  if (lat === null || lng === null || !isFinite(lat) || !isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null; // null island = stripped/bogus

  return {
    lat: latRef === 'S' ? -lat : lat,
    lng: lngRef === 'W' ? -lng : lng,
  };
}
