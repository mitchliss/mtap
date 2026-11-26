// Lens picker + snapshot share card (v5.2). The 🔭 button in the top bar opens a
// sheet of lenses; the choice is remembered on this device and applies whenever no
// guess is being made. "Share a snapshot" turns the current view (lens included)
// into a 4:5 picture card and hands it to the phone's share sheet, or downloads it.

const LENS_KEY = 'marctap.lens';
const DAILY = 'daily', OFF = 'off';
// Kept here (not imported from lens.js) so the picker costs nothing until a lens is used.
const LENSES_ONLY = [
  { id: 'nightowl', name: 'Night Owl', emoji: '🦉', blurb: 'Green night-vision goggles' },
  { id: 'heatmap', name: 'Heat Map', emoji: '🔥', blurb: 'A thermal camera: warm glows, cool fades' },
  { id: 'retrotv', name: 'Retro TV', emoji: '📺', blurb: 'An old tube TV with wobbly scanlines' },
  { id: 'cartoon', name: 'Cartoon', emoji: '🎨', blurb: 'Bold colours and inked outlines' },
  { id: 'noir', name: 'Film Noir', emoji: '🎞️', blurb: 'A black-and-white detective movie' },
];

// v5.5: a different lens each day, on the menus, end screen and Explore only.
export const lensOfDay = (puzzle) => LENSES_ONLY[((puzzle % LENSES_ONLY.length) + LENSES_ONLY.length) % LENSES_ONLY.length].id;

// 'daily' (never chosen - the default), 'off', or a lens id the player picked.
export function lensChoice() {
  try {
    const v = localStorage.getItem(LENS_KEY);
    return v === OFF || LENSES_ONLY.some((l) => l.id === v) ? v : DAILY;
  } catch { return DAILY; }
}
export function savedLens() { const c = lensChoice(); return c === DAILY || c === OFF ? null : c; }
function saveChoice(choice) {
  try { if (choice === DAILY) localStorage.removeItem(LENS_KEY); else localStorage.setItem(LENS_KEY, choice); } catch { /* private mode */ }
}
export const lensName = (id) => LENSES_ONLY.find((l) => l.id === id)?.name || 'No lens';

// What the globe should run for a choice: [lens id | null, scope].
export function lensForChoice(choice, puzzle) {
  if (choice === OFF) return [null, 'always'];
  if (choice === DAILY) return [lensOfDay(puzzle), 'menus'];
  return [choice, 'always'];
}

// Card layout: the picture keeps the view's shape (square-ish on a phone, a band on a
// wide desktop) between 540 and 1080 px tall, cover-fitted, with a caption band below.
export function cardLayout(srcW, srcH, W = 1080, band = 270) {
  const boxH = Math.round(Math.min(1080, Math.max(540, W * srcH / srcW)));
  const scale = Math.max(W / srcW, boxH / srcH);
  const sw = W / scale, sh = boxH / scale;
  return { W, H: boxH + band, boxH, sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

export function initLensUI({ globe, toast, caption, puzzle }) {
  const $ = (id) => document.getElementById(id);
  const modal = $('lens-modal'), list = $('lens-list');
  let choice = lensChoice();
  const apply = () => {
    const [id, scope] = lensForChoice(choice, puzzle());
    globe.setLens(id, scope);
    $('btn-lens').classList.toggle('lens-on', !!id);
  };
  apply();

  const menu = () => [
    { choice: DAILY, emoji: '🎲', name: 'Lens of the day', blurb: `Today: ${lensName(lensOfDay(puzzle()))}, on the menus, the end screen and Explore` },
    { choice: OFF, emoji: '🌍', name: 'No lens', blurb: 'The globe as it is' },
    ...LENSES_ONLY.map((l) => ({ choice: l.id, emoji: l.emoji, name: l.name, blurb: `${l.blurb}, after every guess` })),
  ];
  const render = () => {
    list.replaceChildren(...menu().map((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lens-option' + (item.choice === choice ? ' selected' : '');
      b.setAttribute('aria-pressed', String(item.choice === choice));
      b.innerHTML = '<span class="lens-emoji"></span><span class="lens-text"><b></b><small></small></span>';
      b.querySelector('.lens-emoji').textContent = item.emoji;
      b.querySelector('b').textContent = item.name;
      b.querySelector('small').textContent = item.blurb;
      b.onclick = () => choose(item.choice);
      return b;
    }));
  };

  const choose = (next) => {
    choice = next;
    saveChoice(next);
    apply();
    render();
    modal.classList.add('hidden');
    if (next === DAILY) toast(`Lens of the day: ${lensName(lensOfDay(puzzle()))}`);
    else if (next !== OFF) toast(globe.interactive ? `${lensName(next)} switches on after you guess` : `${lensName(next)} on`);
  };

  $('btn-lens').addEventListener('click', () => { render(); modal.classList.remove('hidden'); });
  $('lens-snapshot').addEventListener('click', async () => {
    modal.classList.add('hidden');
    // Mid-guess the view would give the answer away (and no lens runs then).
    if (globe.interactive) { toast('Snapshots unlock after you guess 📸'); return; }
    await new Promise((r) => requestAnimationFrame(r)); // let the sheet close and a lens frame land
    try { await shareCard(globe, caption(), globe._lensActive() ? globe._lensId : null); } catch (err) { if (err?.name !== 'AbortError') toast('Could not make the snapshot'); }
  });

  return {
    // A new day can start while the app stays open: refresh the daily lens.
    refresh: apply,
    // Called by the globe when a lens can't hold the frame rate on this device.
    tooSlow(lensId) {
      if (!lensId) return;
      choose(OFF);
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
