// MarcTap entry point: wires the globe, game logic, and UI together.

import './style.css';
import { Globe } from './globe.js';
import { loadCountries, formatDistance } from './geo.js';
import {
  GameSession, ROUNDS_PER_GAME, MAX_GAME_SCORE,
  dailySeed, practiceSeed, dailyAlreadyPlayed, recordDailyResult,
  emojiForScore, verdictForResult, buildShareText, computeStreak,
  loadSettings, saveSettings,
} from './game.js';
import { puzzleNumberForToday, todayDateText } from './rng.js';

const $ = (id) => document.getElementById(id);

const els = {
  promptCard: $('prompt-card'), promptPlace: $('prompt-place'), promptSub: $('prompt-sub'),
  roundDots: $('round-dots'),
  confirmBar: $('confirm-bar'), btnConfirm: $('btn-confirm'), btnClear: $('btn-clear'),
  resultPanel: $('result-panel'), resultPlace: $('result-place'), resultDistance: $('result-distance'),
  resultPoints: $('result-points'), resultVerdict: $('result-verdict'), resultFact: $('result-fact'),
  btnNext: $('btn-next'),
  startScreen: $('start-screen'), btnPlay: $('btn-play'), btnPractice: $('btn-practice'),
  startPuzzleLabel: $('start-puzzle-label'), startStreak: $('start-streak'),
  endScreen: $('end-screen'), endTitle: $('end-title'), endScoreValue: $('end-score-value'),
  endEmoji: $('end-emoji'), endRounds: $('end-rounds'), endStats: $('end-stats'),
  btnShare: $('btn-share'), btnPlayPractice: $('btn-play-practice'), btnReview: $('btn-review'),
  scoreValue: $('score-value'), puzzleNumber: $('puzzle-number'), puzzleDate: $('puzzle-date'),
  btnHelp: $('btn-help'), btnSettings: $('btn-settings'),
  helpModal: $('help-modal'), settingsModal: $('settings-modal'),
  setMiles: $('set-miles'), setDoubleTap: $('set-doubletap'), setSound: $('set-sound'), setAutoRotate: $('set-autorotate'),
  toast: $('toast'),
};

let settings = loadSettings();
let session = null;
let globe = null;
let awaitingConfirm = false;
let roundLocked = false; // true between confirm and "Next"

// ---------- tiny sound engine (WebAudio, no assets) ----------
let audioCtx = null;
function blip(freq, durationMs = 90, type = 'sine', gainValue = 0.06) {
  if (!settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000);
  } catch { /* audio unavailable */ }
}
const sounds = {
  tap: () => blip(520, 70, 'sine'),
  confirm: () => blip(700, 120, 'triangle'),
  good: () => { blip(660, 110, 'triangle'); setTimeout(() => blip(880, 160, 'triangle'), 110); },
  bad: () => blip(220, 220, 'sawtooth', 0.04),
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 180, 'triangle'), i * 130)); },
};

// ---------- UI helpers ----------

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function toast(msg, ms = 1800) {
  els.toast.textContent = msg;
  show(els.toast);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => hide(els.toast), ms);
}

function renderRoundDots() {
  els.roundDots.innerHTML = '';
  for (let i = 0; i < ROUNDS_PER_GAME; i++) {
    const dot = document.createElement('div');
    dot.className = 'round-dot';
    const r = session.results[i];
    if (r) {
      dot.classList.add(r.score >= 70 ? 'done-good' : r.score >= 30 ? 'done-ok' : 'done-bad');
    } else if (i === session.roundIndex) {
      dot.classList.add('current');
    }
    els.roundDots.appendChild(dot);
  }
}

function setScoreDisplay(value, animateFrom = null) {
  if (animateFrom === null) { els.scoreValue.textContent = value; return; }
  const start = performance.now();
  const dur = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    els.scoreValue.textContent = Math.round(animateFrom + (value - animateFrom) * t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Guarantee the final value lands even if rAF is throttled (backgrounded tab).
  setTimeout(() => { els.scoreValue.textContent = value; }, dur + 150);
}

function flyPoints(text) {
  const el = document.createElement('div');
  el.className = 'points-fly';
  el.textContent = text;
  el.style.left = '50%';
  el.style.top = '38%';
  document.getElementById('app').appendChild(el);
  setTimeout(() => el.remove(), 1250);
}

// ---------- round flow ----------

function startGame(isPractice) {
  const seed = isPractice ? practiceSeed() : dailySeed();
  session = new GameSession(seed, isPractice);
  awaitingConfirm = false;
  roundLocked = false;
  hide(els.startScreen);
  hide(els.endScreen);
  hide(els.resultPanel);
  hide(els.confirmBar);
  globe.clearPin();
  globe.clearResults();
  globe.setAutoRotate(false);
  globe.setInteractive(true);
  setScoreDisplay(0);
  beginRound();
}

function beginRound() {
  const loc = session.currentLocation;
  els.promptPlace.textContent = loc.name;
  els.promptSub.textContent = `Round ${session.roundIndex + 1} of ${ROUNDS_PER_GAME}`;
  renderRoundDots();
  show(els.promptCard);
  hide(els.resultPanel);
  hide(els.confirmBar);
  globe.clearPin();
  globe.clearResults();
  globe.setInteractive(true);
  awaitingConfirm = false;
  roundLocked = false;
}

function onGlobeTap() {
  if (roundLocked) return;
  sounds.tap();
  if (!awaitingConfirm) {
    awaitingConfirm = true;
    show(els.confirmBar);
  }
}

function onGlobeDoubleTap(lat, lng) {
  if (roundLocked) return;
  if (settings.doubleTap) {
    confirmGuess(lat, lng);
  } else {
    onGlobeTap();
  }
}

function confirmGuess(lat, lng) {
  if (roundLocked) return;
  const pin = globe.getPin();
  const g = pin || { lat, lng };
  if (!g) return;
  roundLocked = true;
  awaitingConfirm = false;
  globe.setInteractive(false);
  hide(els.confirmBar);
  sounds.confirm();

  const prevTotal = session.totalScore;
  const result = session.submitGuess(g.lat, g.lng);

  globe.showAnswer(result.guess, { lat: result.target.lat, lng: result.target.lng });

  // Reveal panel after the camera settles a beat.
  setTimeout(() => {
    els.resultPlace.textContent = result.target.name;
    els.resultDistance.textContent = result.bullseye ? '🎯 ' + formatDistance(result.distanceKm, settings.miles) : formatDistance(result.distanceKm, settings.miles);
    els.resultPoints.textContent = `+${result.score}`;
    els.resultVerdict.textContent = verdictForResult(result);
    els.resultFact.textContent = result.target.fact || '';
    els.btnNext.textContent = session.roundIndex + 1 >= ROUNDS_PER_GAME ? 'See results →' : 'Next →';
    show(els.resultPanel);
    renderRoundDots();
    flyPoints(`+${result.score}`);
    setScoreDisplay(prevTotal + result.score, prevTotal);
    if (result.score >= 70) sounds.good(); else if (result.score < 15) sounds.bad(); else sounds.tap();
  }, 900);
}

function nextRound() {
  session.nextRound();
  if (session.isOver) {
    endGame();
  } else {
    beginRound();
  }
}

function endGame() {
  hide(els.resultPanel);
  hide(els.promptCard);
  globe.clearPin();
  globe.setInteractive(false);
  globe.setAutoRotate(settings.autoRotate);
  sounds.fanfare();

  const total = session.totalScore;
  const rounds = session.results.map((r) => ({
    name: r.target.name,
    score: r.score,
    distanceKm: Math.round(r.distanceKm),
  }));

  if (!session.isPractice) {
    recordDailyResult(puzzleNumberForToday(), rounds, total);
  }

  els.endTitle.textContent = session.isPractice
    ? 'Practice complete!'
    : `MarcTap #${puzzleNumberForToday()} complete!`;
  els.endScoreValue.textContent = total;
  els.endEmoji.textContent = session.results.map((r) => emojiForScore(r.score)).join(' ');

  els.endRounds.innerHTML = '';
  session.results.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'end-round-row';
    row.innerHTML = `
      <span>${emojiForScore(r.score)}</span>
      <span class="rr-name"></span>
      <span class="rr-dist"></span>
      <span class="rr-pts">+${r.score}</span>`;
    row.querySelector('.rr-name').textContent = r.target.name;
    row.querySelector('.rr-dist').textContent = formatDistance(r.distanceKm, settings.miles);
    els.endRounds.appendChild(row);
  });

  const stats = computeStreak();
  els.endStats.innerHTML = session.isPractice
    ? ''
    : `🔥 Streak: <b>${stats.streak}</b> · Played: <b>${stats.played}</b> · Best: <b>${stats.best}</b> · Avg: <b>${stats.average}</b>`;

  show(els.endScreen);
}

function showEndScreenForRecorded(record) {
  // Rebuild the end screen from a stored daily result (revisiting after playing).
  els.endTitle.textContent = `MarcTap #${puzzleNumberForToday()} — already played today!`;
  els.endScoreValue.textContent = record.total;
  els.endEmoji.textContent = record.rounds.map((r) => emojiForScore(r.score)).join(' ');
  els.endRounds.innerHTML = '';
  record.rounds.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'end-round-row';
    row.innerHTML = `
      <span>${emojiForScore(r.score)}</span>
      <span class="rr-name"></span>
      <span class="rr-dist"></span>
      <span class="rr-pts">+${r.score}</span>`;
    row.querySelector('.rr-name').textContent = r.name;
    row.querySelector('.rr-dist').textContent = formatDistance(r.distanceKm, settings.miles);
    els.endRounds.appendChild(row);
  });
  const stats = computeStreak();
  els.endStats.innerHTML =
    `🔥 Streak: <b>${stats.streak}</b> · Played: <b>${stats.played}</b> · Best: <b>${stats.best}</b> · Avg: <b>${stats.average}</b>`;
  hide(els.startScreen);
  show(els.endScreen);
  globe.setAutoRotate(settings.autoRotate);
}

// ---------- share ----------

async function shareScore() {
  let text;
  if (session && session.isOver !== undefined && session.results.length === ROUNDS_PER_GAME) {
    text = buildShareText(puzzleNumberForToday(), session.results, session.totalScore, session.isPractice);
  } else {
    const record = dailyAlreadyPlayed(puzzleNumberForToday());
    if (!record) return;
    text = buildShareText(puzzleNumberForToday(), record.rounds, record.total, false);
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Score copied to clipboard! 📋');
  } catch {
    toast('Could not copy — here it is: ' + text, 4000);
  }
}

// ---------- boot ----------

async function boot() {
  // Header labels
  els.puzzleNumber.textContent = `#${puzzleNumberForToday()}`;
  els.puzzleDate.textContent = todayDateText();
  els.startPuzzleLabel.textContent = `MarcTap #${puzzleNumberForToday()} · ${todayDateText()}`;

  const stats = computeStreak();
  if (stats.played > 0) {
    els.startStreak.innerHTML = `🔥 Streak: <b>${stats.streak}</b> · Games played: <b>${stats.played}</b> · Best score: <b>${stats.best}</b>`;
  }

  // Settings UI
  els.setMiles.checked = settings.miles;
  els.setDoubleTap.checked = settings.doubleTap;
  els.setSound.checked = settings.sound;
  els.setAutoRotate.checked = settings.autoRotate;

  // Globe
  globe = new Globe(document.getElementById('globe-container'), {
    onTap: onGlobeTap,
    onDoubleTap: onGlobeDoubleTap,
  });
  globe.setAutoRotate(settings.autoRotate);

  const geojson = await loadCountries(`${import.meta.env.BASE_URL}data/countries-50m.geojson`);
  await globe.init(geojson);

  // If today's daily is already done, let the player know on Play.
  els.btnPlay.addEventListener('click', () => {
    const record = dailyAlreadyPlayed(puzzleNumberForToday());
    if (record) {
      showEndScreenForRecorded(record);
    } else {
      startGame(false);
    }
  });
  els.btnPractice.addEventListener('click', () => startGame(true));
  els.btnPlayPractice.addEventListener('click', () => startGame(true));
  els.btnReview.addEventListener('click', () => {
    hide(els.endScreen);
    show(els.startScreen);
  });

  els.btnConfirm.addEventListener('click', () => {
    const pin = globe.getPin();
    if (!pin) { toast('Tap the globe first to drop a pin 📍'); return; }
    confirmGuess(pin.lat, pin.lng);
  });
  els.btnClear.addEventListener('click', () => {
    globe.clearPin();
    awaitingConfirm = false;
    hide(els.confirmBar);
  });
  els.btnNext.addEventListener('click', nextRound);
  els.btnShare.addEventListener('click', shareScore);

  // Nudge pad (click + press-and-hold repeat)
  document.querySelectorAll('.nudge').forEach((btn) => {
    const dir = btn.dataset.nudge;
    let holdTimer = null, repeatTimer = null;
    const doNudge = () => { globe.nudgePin(dir); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      doNudge();
      holdTimer = setTimeout(() => { repeatTimer = setInterval(doNudge, 70); }, 350);
    });
    const stop = () => { clearTimeout(holdTimer); clearInterval(repeatTimer); };
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  });

  // Keyboard shortcuts: arrows nudge, Enter confirms.
  window.addEventListener('keydown', (e) => {
    if (roundLocked || !session || session.isOver) return;
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (map[e.key] && globe.getPin()) {
      e.preventDefault();
      globe.nudgePin(map[e.key]);
    } else if (e.key === 'Enter' && awaitingConfirm) {
      const pin = globe.getPin();
      if (pin) confirmGuess(pin.lat, pin.lng);
    } else if (e.key === 'Escape' && awaitingConfirm) {
      globe.clearPin();
      awaitingConfirm = false;
      hide(els.confirmBar);
    }
  });

  // Modals
  els.btnHelp.addEventListener('click', () => show(els.helpModal));
  els.btnSettings.addEventListener('click', () => show(els.settingsModal));
  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => hide($(b.dataset.close)));
  });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) hide(m); });
  });

  // Settings changes
  const syncSettings = () => {
    settings = {
      miles: els.setMiles.checked,
      doubleTap: els.setDoubleTap.checked,
      sound: els.setSound.checked,
      autoRotate: els.setAutoRotate.checked,
    };
    saveSettings(settings);
    if (!session || session.isOver) globe.setAutoRotate(settings.autoRotate);
  };
  [els.setMiles, els.setDoubleTap, els.setSound, els.setAutoRotate].forEach((el) =>
    el.addEventListener('change', syncSettings)
  );

  // First-visit help
  if (!localStorage.getItem('marctap.seenHelp')) {
    localStorage.setItem('marctap.seenHelp', '1');
    setTimeout(() => show(els.helpModal), 600);
  }
}

boot();

// Debug/testing handle (harmless in production).
import('./game.js').then((g) => { window.__marctapGame = g; });
import('./geo.js').then((g) => { window.__marctapGeo = g; });
window.__marctap = {
  globe: () => globe,
  session: () => session,
  state: () => ({ awaitingConfirm, roundLocked, interactive: globe?.interactive }),
  tapAt: (lat, lng) => { globe.movePin(lat, lng); onGlobeTap(); },
  confirmAt: (lat, lng) => { globe.movePin(lat, lng); confirmGuess(lat, lng); },
  next: () => nextRound(),
};
