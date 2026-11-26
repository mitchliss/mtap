// Shaded relief (v5.7): the atlas look. A hillshade is computed once from the NASA
// Blue Marble topography map (public domain, public/textures/earth-relief*.jpg) and
// blended into the globe's colour texture with "overlay", so mid-grey (flat ground,
// the sea) leaves the picture alone, sunlit slopes brighten and shaded slopes darken.
// Light from the north-west, as on printed maps. Pure (no DOM) so Node can test it.

export const RELIEF = {
  maxElevM: 6400,     // white in the source map
  exaggeration: 14,   // vertical stretch; mountains read at whole-globe distance
  contrast: 1.6,      // how far shade departs from neutral grey
};

// heights: Uint8 (one byte per pixel, 0 = sea level/ocean), w x h equirectangular.
// Returns a Uint8ClampedArray RGBA image: grey 128 = no change.
export function hillshade(heights, w, h, opts = {}) {
  const { maxElevM, exaggeration, contrast } = { ...RELIEF, ...opts };
  const out = new Uint8ClampedArray(w * h * 4);
  const L = [-1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]; // from NW, 35 deg up
  const flat = L[2];
  const mPerPxEq = 40075000 / w;
  const mPerPxY = 20004000 / h;
  const scale = (maxElevM / 255) * exaggeration;
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const dx = Math.max(mPerPxEq * Math.cos(lat), mPerPxEq * 0.05);
    const yUp = y > 0 ? y - 1 : y, yDn = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let g = 128;
      if (heights[i] > 0) {
        const xl = x > 0 ? x - 1 : w - 1, xr = x < w - 1 ? x + 1 : 0;
        const ge = ((heights[y * w + xr] - heights[y * w + xl]) * scale) / (2 * dx);
        const gn = ((heights[yUp * w + x] - heights[yDn * w + x]) * scale) / ((yDn - yUp || 1) * mPerPxY);
        const len = Math.hypot(ge, gn, 1);
        const shade = (-ge * L[0] - gn * L[1] + L[2]) / len;
        g = 128 + (shade - flat) * contrast * 255;
      }
      const o = i * 4;
      out[o] = out[o + 1] = out[o + 2] = g;
      out[o + 3] = 255;
    }
  }
  return out;
}

// Browser: draw the relief map, shade it, and overlay it onto a 2D context.
export async function overlayRelief(ctx, W, H, url, { strength = 0.9, maxW = 4096 } = {}) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
  const w = Math.min(maxW, img.naturalWidth), h = Math.round(w / 2);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const heights = new Uint8Array(w * h);
  for (let i = 0; i < heights.length; i++) heights[i] = src[i * 4];
  g.putImageData(new ImageData(hillshade(heights, w, h), w, h), 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = strength;
  ctx.drawImage(c, 0, 0, W, H);
  ctx.restore();
}
