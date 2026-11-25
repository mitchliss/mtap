// Lens picker + snapshot share card (v5.2). The 🔭 button in the top bar opens a
// sheet of lenses; the choice is remembered on this device and applies whenever no
// guess is being made. "Share a snapshot" turns the current view (lens included)
// into a 4:5 picture card and hands it to the phone's share sheet, or downloads it.

const LENS_KEY = 'marctap.lens';
// Kept here (not imported from lens.js) so the picker costs nothing until a lens is used.
const LENS_MENU = [
  { id: null, name: 'No lens', emoji: '🌍', blurb: 'The globe as it is' },
  { id: 'nightowl', name: 'Night Owl', emoji: '🦉', blurb: 'Green night-vision goggles' },
  { id: 'heatmap', name: 'Heat Map', emoji: '🔥', blurb: 'A thermal camera: warm glows, cool fades' },
  { id: 'retrotv', name: 'Retro TV', emoji: '📺', blurb: 'An old tube TV with wobbly scanlines' },
  { id: 'cartoon', name: 'Cartoon', emoji: '🎨', blurb: 'Bold colours and inked outlines' },
  { id: 'noir', name: 'Film Noir', emoji: '🎞️', blurb: 'A black-and-white detective movie' },
];

export function savedLens() {
  try { const id = localStorage.getItem(LENS_KEY); return LENS_MENU.some((l) => l.id === id) ? id : null; } catch { return null; }
}
function saveLens(id) {
  try { if (id) localStorage.setItem(LENS_KEY, id); else localStorage.removeItem(LENS_KEY); } catch { /* private mode */ }
}
export const lensName = (id) => LENS_MENU.find((l) => l.id === id)?.name || 'No lens';

// Card layout: the picture keeps the view's shape (square-ish on a phone, a band on a
// wide desktop) between 540 and 1080 px tall, cover-fitted, with a caption band below.
export function cardLayout(srcW, srcH, W = 1080, band = 270) {
  const boxH = Math.round(Math.min(1080, Math.max(540, W * srcH / srcW)));
  const scale = Math.max(W / srcW, boxH / srcH);
  const sw = W / scale, sh = boxH / scale;
  return { W, H: boxH + band, boxH, sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

export function initLensUI({ globe, toast, caption }) {
  const $ = (id) => document.getElementById(id);
  const modal = $('lens-modal'), list = $('lens-list');
  let current = savedLens();
  globe.setLens(current);

  const render = () => {
    list.replaceChildren(...LENS_MENU.map((lens) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lens-option' + (lens.id === current ? ' selected' : '');
      b.setAttribute('aria-pressed', String(lens.id === current));
      b.innerHTML = '<span class="lens-emoji"></span><span class="lens-text"><b></b><small></small></span>';
      b.querySelector('.lens-emoji').textContent = lens.emoji;
      b.querySelector('b').textContent = lens.name;
      b.querySelector('small').textContent = lens.blurb;
      b.onclick = () => choose(lens.id);
      return b;
    }));
  };

  const choose = (id) => {
    current = id;
    saveLens(id);
    globe.setLens(id);
    render();
    modal.classList.add('hidden');
    $('btn-lens').classList.toggle('lens-on', !!id);
    if (id) toast(globe.interactive ? `${lensName(id)} switches on after you guess` : `${lensName(id)} on`);
  };

  $('btn-lens').addEventListener('click', () => { render(); modal.classList.remove('hidden'); });
  $('btn-lens').classList.toggle('lens-on', !!current);
  $('lens-snapshot').addEventListener('click', async () => {
    modal.classList.add('hidden');
    // Mid-guess the view would give the answer away (and no lens runs then).
    if (globe.interactive) { toast('Snapshots unlock after you guess 📸'); return; }
    await new Promise((r) => requestAnimationFrame(r)); // let the sheet close and a lens frame land
    try { await shareCard(globe, caption(), current); } catch (err) { if (err?.name !== 'AbortError') toast('Could not make the snapshot'); }
  });

  // Called by the globe when a lens can't hold the frame rate on this device.
  return {
    tooSlow(lensId) {
      if (current !== lensId) return;
      choose(null);
      toast(`${lensName(lensId)} switched off to keep the globe smooth on this device`, 4000);
    },
  };
}

// The 1080-wide picture card: the current view (lens included) plus a caption band.
export function makeCard(globe, cap, lensId) {
  const src = globe.snapshotCanvas();
  const L = cardLayout(src.width, src.height);
  const card = document.createElement('canvas');
  card.width = L.W; card.height = L.H;
  const g = card.getContext('2d');
  g.fillStyle = '#060a18'; g.fillRect(0, 0, L.W, L.H);
  g.drawImage(src, L.sx, L.sy, L.sw, L.sh, 0, 0, L.W, L.boxH);
  const grad = g.createLinearGradient(0, L.boxH - 120, 0, L.boxH);
  grad.addColorStop(0, 'rgba(6,10,24,0)'); grad.addColorStop(1, 'rgba(6,10,24,1)');
  g.fillStyle = grad; g.fillRect(0, L.boxH - 120, L.W, 120);

  const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff'; g.font = `800 64px ${font}`;
  g.fillText('🌍 M', 56, L.boxH + 86);
  const mW = g.measureText('🌍 M').width;
  g.fillStyle = '#4aa8ff'; g.fillText('Tap', 56 + mW, L.boxH + 86);
  g.fillStyle = '#ffd166'; g.font = `600 34px ${font}`;
  g.textAlign = 'right'; g.fillText(cap.title || '', L.W - 56, L.boxH + 80); g.textAlign = 'left';
  g.fillStyle = '#e6eeff'; g.font = `600 40px ${font}`;
  fitText(g, cap.line || '', 56, L.boxH + 160, L.W - 112);
  g.fillStyle = '#93a3c4'; g.font = `500 30px ${font}`;
  fitText(g, `${lensId ? lensName(lensId) + ' lens · ' : ''}mitchliss.github.io/mtap`, 56, L.boxH + 218, L.W - 112);
  return card;
}

async function shareCard(globe, cap, lensId) {
  const card = makeCard(globe, cap, lensId);
  const blob = await new Promise((resolve, reject) => card.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
  const file = new File([blob], `mtap-${(cap.slug || 'snapshot')}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: cap.line || 'MTap' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function fitText(g, text, x, y, maxW) {
  let t = text;
  while (t.length > 4 && g.measureText(t).width > maxW) t = t.slice(0, -2);
  g.fillText(t === text ? t : t.trimEnd() + '…', x, y);
}
