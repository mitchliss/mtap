import { distanceKm, formatDistance } from './geo.js';
import { fetchWikiSummary } from './enrich.js';
import { bearingWord, guessRelationship, nearbyCities, shortStory } from './discovery.js';

const $ = (id) => document.getElementById(id);
const visible = (id, on) => $(id).classList.toggle('hidden', !on);
const TRAINING_SPOT = { lat: 40.7128, lng: -74.006, name: 'New York City' };

export class Experience {
  constructor(globe, options) {
    this.globe = globe; this.options = options; this.serial = 0; this.labels = [];
    this.cities = fetch(`${import.meta.env.BASE_URL}data/cities.json`).then((r) => r.json()).then((d) => d.cities).catch(() => []);
    $('btn-precision').onclick = () => this.precision(!globe.precisionMode);
    $('btn-adjust').onclick = () => {
      const open = $('nudge-controls').classList.contains('hidden');
      if (open) this.precision(false);
      visible('nudge-controls', open); $('btn-adjust').setAttribute('aria-expanded', String(open));
    };
    $('tutorial-skip').onclick = () => this.finishIntro();
    $('discovery-compare').onclick = () => {
      if (!this.result) return;
      const { guess, target } = this.result;
      globe.framePoints(guess, target);
    };
    $('discovery-explore').onclick = () => {
      if (this.result) globe.flyTo(this.result.target.lat, this.result.target.lng, 1.1, 850);
    };
  }

  round() {
    $('app').classList.remove('discovering'); this.globe.resize();
    this.serial++; this.result = null; this.labels = [];
    this.precision(false); this.active = true;
    visible('aim-tools', true); visible('nudge-controls', false);
    $('btn-adjust').setAttribute('aria-expanded', 'false');
    visible('discovery-labels', false); visible('guest-invite', false);
    $('discovery-labels').replaceChildren();
    $('result-panel').scrollTop = 0;
  }

  precision(on) {
    this.globe.setPrecisionMode(on);
    visible('precision-crosshair', on); visible('precision-loupe', on); visible('aim-help', on);
    $('btn-precision').setAttribute('aria-pressed', String(on));
    $('btn-precision').textContent = on ? '◎ Precision on' : '◎ Precision';
    if (on) {
      visible('nudge-controls', false); $('btn-adjust').setAttribute('aria-expanded', 'false');
      this.options.onCandidate();
      if (this.intro?.step === 'adjust') this.intro.anchor = this.globe.getPin();
    }
  }

  beforeConfirm() {
    this.globe.updatePrecisionPin();
    if (this.intro) {
      if (this.intro.step === 'confirm') this.finishIntro();
      return false;
    }
    this.precision(false); this.active = false; visible('aim-tools', false);
    return true;
  }

  startIntro(resume) {
    this.round();
    this.intro = { step: 'spin', resume, initial: null };
    visible('start-screen', false); visible('tutorial-card', true);
    this.globe.clearPin(); this.globe.clearResults();
    this.globe.setAutoRotate(false); this.globe.setInteractive(true); this.globe.setGameplayActive(true);
    this.globe.flyTo(TRAINING_SPOT.lat, TRAINING_SPOT.lng, 2.1, 600);
    this.instruction('1 / 4 · Spin the globe', 'Drag anywhere on Earth to turn it. This quick introduction is unscored.');
  }
  instruction(title, text) { $('tutorial-title').textContent = title; $('tutorial-instruction').textContent = text; }
  candidate() {
    if (!this.intro) return false;
    const pin = this.globe.getPin();
    if (this.intro.step === 'spin') { this.globe.clearPin(); return true; }
    if (this.intro.step === 'find') {
      if (!pin || distanceKm(pin.lat, pin.lng, TRAINING_SPOT.lat, TRAINING_SPOT.lng) > 1800) {
        this.instruction('2 / 4 · Find the glowing spot', 'Tap closer to the glowing ring at New York City. You can pinch to zoom.');
        this.globe.clearPin(); return true;
      }
      this.intro.step = 'adjust'; this.intro.anchor = { ...pin };
      this.instruction('3 / 4 · Fine-tune your pin', 'Drag your pin, use Adjust, or switch on Precision and move the map a little.');
      visible('confirm-bar', true); $('btn-confirm').disabled = true;
    } else this.pinChanged();
    return true;
  }
  pinChanged() {
    if (this.intro?.step !== 'adjust') return;
    const pin = this.globe.getPin(), anchor = this.intro.anchor;
    if (!pin || !anchor || distanceKm(pin.lat, pin.lng, anchor.lat, anchor.lng) < 0.01) return;
    this.intro.step = 'confirm';
    $('btn-confirm').disabled = false;
    this.instruction('4 / 4 · Make it official', 'Press Confirm guess. Your game starts next, with a fresh score.');
  }
  finishIntro() {
    if (!this.intro) return;
    const resume = this.intro.resume; this.intro = null;
    localStorage.setItem('marctap.introDone', '1');
    this.precision(false); this.globe.clearPin();
    for (const id of ['tutorial-card', 'tutorial-target', 'confirm-bar']) visible(id, false);
    $('btn-confirm').disabled = false;
    resume();
  }

  frame() {
    const globe = this.globe;
    if (this.intro) {
      if (this.intro.step === 'spin' && !globe._flights.length) {
        const current = globe.camera.position.clone().normalize();
        if (!this.intro.initial) this.intro.initial = current;
        else if (current.angleTo(this.intro.initial) > 0.03) {
          this.intro.step = 'find';
          this.instruction('2 / 4 · Find the glowing spot', 'Tap the glowing ring at New York City. Zoom in if you like.');
        }
      }
      const spot = globe.screenPoint(TRAINING_SPOT.lat, TRAINING_SPOT.lng);
      visible('tutorial-target', !!spot && this.intro.step !== 'spin');
      if (spot) { $('tutorial-target').style.left = `${spot.x}px`; $('tutorial-target').style.top = `${spot.y}px`; }
      this.pinChanged();
    }
    if (globe.precisionMode && performance.now() - (this.lastLoupe || 0) > 33) {
      this.lastLoupe = performance.now();
      const source = globe.renderer.domElement, loupe = $('precision-loupe').querySelector('canvas');
      const size = source.width / source.clientWidth * 48;
      const ctx = loupe.getContext('2d');
      ctx.drawImage(source, (source.width - size) / 2, (source.height - size) / 2, size, size, 0, 0, 192, 192);
    }
    const occupied = [];
    for (const label of this.labels) {
      const point = globe.screenPoint(label.lat, label.lng);
      label.el.hidden = !point;
      if (point) {
        const width = label.el.offsetWidth || 80;
        const x = Math.max(width / 2 + 4, Math.min(globe.container.clientWidth - width / 2 - 4, point.x));
        let y = Math.max(24, point.y - 8);
        const overlaps = () => occupied.some((r) => Math.abs(r.x - x) < (r.width + width) / 2 + 5 && Math.abs(r.y - y) < 24);
        if (overlaps()) {
          if (label.kind === 'city') { label.el.hidden = true; continue; }
          y += 26;
        }
        label.el.style.left = `${x}px`; label.el.style.top = `${y}px`;
        occupied.push({ x, y, width });
      }
    }
  }

  async reveal(result, miles) {
    const token = ++this.serial;
    this.result = result; this.labels = [];
    $('app').classList.add('discovering'); this.globe.resize();
    this.globe.framePoints(result.guess, result.target);
    this.active = false; this.precision(false); visible('aim-tools', false);
    $('discovery-relation').textContent = guessRelationship(result.guess, result.target, miles);
    visible('discovery-world', result.distanceKm > 17500);
    if (result.distanceKm > 17500) {
      const canvas = $('discovery-world').querySelector('canvas'), ctx = canvas.getContext('2d');
      ctx.drawImage(this.globe.sphere.material.map.image, 0, 0, 360, 180);
      for (const [point, color] of [[result.guess, '#ff7896'], [result.target, '#83ffb0']]) {
        ctx.beginPath(); ctx.arc((point.lng + 180) % 360, 90 - point.lat, 5, 0, 2 * Math.PI);
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    $('discovery-story').textContent = 'Finding the story behind this place…';
    visible('result-fact', true);
    $('discovery-nearby').textContent = '';
    visible('discovery-photo', false); visible('discovery-source', false);
    $('discovery-labels').replaceChildren(); visible('discovery-labels', true);
    const addLabel = (point, name, kind) => {
      const el = document.createElement('span'); el.className = `discovery-map-label ${kind}`; el.textContent = name;
      $('discovery-labels').append(el); this.labels.push({ ...point, el, kind });
    };
    addLabel(result.guess, 'Your pin', 'guess'); addLabel(result.target, 'Destination', 'destination');
    this.cities.then((cities) => {
      if (token !== this.serial) return;
      const nearby = nearbyCities(result.target, cities);
      $('discovery-nearby').textContent = nearby.length
        ? 'Nearby mapped cities: ' + nearby.map((c) => `${c.name} (${formatDistance(c.distance, miles)} ${bearingWord(result.target, c)})`).join(' · ')
        : 'Explore the coastline and terrain around the destination on the globe.';
      nearby.forEach((c) => { if (c.distance > 5) addLabel(c, c.name, 'city'); });
    });
    // Family memories stay private: never send their names to Wikipedia.
    const wiki = result.target.isFamily ? null : await fetchWikiSummary(result.target.name);
    if (token !== this.serial) return;
    const coords = wiki?.coordinates;
    const matched = wiki && (!coords || distanceKm(result.target.lat, result.target.lng, coords.lat, coords.lon) < 150);
    const article = matched && wiki.url?.startsWith('https://en.wikipedia.org/') ? wiki.url : null;
    if (article) {
      visible('result-fact', false);
      $('discovery-story').textContent = shortStory(wiki.extract);
      $('discovery-source').href = article; visible('discovery-source', true);
    } else {
      $('discovery-story').textContent = result.target.isFamily ? 'A place from your family’s story.' : 'Explore the destination’s terrain and nearby cities. An article is not available for this place right now.';
    }
    let photo = result.target.isFamily ? result.target.photo : matched ? wiki.thumbnail : null;
    let photoSource = article;
    let photoLabel = 'Photo and credits · Wikipedia';
    // A geographically exact satellite photograph is the fallback when there
    // is no matched landmark photo, rather than showing an unrelated image.
    if (!photo && Math.abs(result.target.lat) < 85) {
      const { lat, lng } = result.target, n = 256;
      const x = Math.floor(((lng + 180) / 360 * n + n) % n);
      const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
      photo = `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/8/${y}/${x}.jpg`;
      photoSource = 'https://s2maps.eu'; photoLabel = 'Satellite view · Sentinel-2 cloudless / EOX';
    }
    if (photo) {
      const img = $('discovery-image');
      img.onload = () => { if (token === this.serial) visible('discovery-photo', true); };
      img.onerror = () => visible('discovery-photo', false);
      img.alt = `${result.target.name} — ${photoLabel.startsWith('Satellite') ? 'satellite view of the surrounding area' : 'location photograph'}`;
      const link = $('discovery-photo-source'); link.textContent = photoLabel;
      if (photoSource) link.href = photoSource; else link.removeAttribute('href');
      img.src = photo;
    }
  }
}
