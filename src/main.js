// MarcTap entry point: wires the globe, game logic, and UI together.

import './style.css';
import { Globe } from './globe.js';
import { loadCountries, formatDistance } from './geo.js';
import {
  GameSession, ROUNDS_PER_GAME, MAX_GAME_SCORE,
  dailySeed, practiceSeed, dailyAlreadyPlayed, recordDailyResult,
  emojiForScore, verdictForResult, buildShareText, computeStreak,
  loadSettings, saveSettings, pickLocations, multiplierForRound,
  practiceExcludeSet, noteLocationsSeen,
} from './game.js';
import { puzzleNumberForToday, todayDateText } from './rng.js';
import { fetchWikiSummary, fetchOnThisDay } from './enrich.js';
import { startMusic, stopMusic, unlockIosAudio } from './music.js';
import { geocodePlace, reverseGeocode } from './geocode.js';
import { extractPhotoLocation } from './exif.js';
import {
  accountsEnabled, onAuthChange, sendLoginLink, completeLoginLink, signOutUser,
  currentUser, syncNow, lastSyncTime,
} from './account.js';
import {
  readHashPayload, encodePayload, shareBaseUrl,
  getActivePlayer, setActivePlayer, getPlayers,
  recordPlayerResult, importResultPayload, buildResultPayload, leaderboardRows,
  setChallenge, getChallenge,
  getFamilyPlaces, addFamilyPlace, buildPlacePayload, importPlacePayload, familyPlaceForPuzzle,
  getCrew, saveCrew, toggleCrewMember, isCrewMember, buildCrewPayload, importCrewPayload,
} from './social.js';

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
  btnShare: $('btn-share'), btnPlayPractice: $('btn-play-practice'), btnExplore: $('btn-explore'),
  overviewPanel: $('overview-panel'), ovPrev: $('ov-prev'), ovNext: $('ov-next'), ovBack: $('ov-back'),
  ovRound: $('ov-round'), ovName: $('ov-name'), ovMeta: $('ov-meta'), ovFact: $('ov-fact'),
  ovWiki: $('ov-wiki'), ovWikiImg: $('ov-wiki-img'), ovWikiExtract: $('ov-wiki-extract'), ovWikiLink: $('ov-wiki-link'),
  onThisDay: $('onthisday'), otdItems: $('otd-items'),
  nameModal: $('name-modal'), nameTitle: $('name-title'), nameInput: $('name-input'), nameKnown: $('name-known'), nameSave: $('name-save'),
  lbModal: $('leaderboard-modal'), lbRows: $('lb-rows'), lbTodayLabel: $('lb-today-label'),
  btnLeaderboard: $('btn-leaderboard'), btnEndLeaderboard: $('btn-end-leaderboard'),
  placeModal: $('place-modal'), placeName: $('place-name'), placeFact: $('place-fact'),
  placeLoc: $('place-loc'), placeFind: $('place-find'), placeResults: $('place-results'), placePinManual: $('place-pin-manual'),
  placePhoto: $('place-photo'),
  placeShareModal: $('place-share-modal'), placeShareSummary: $('place-share-summary'), placeShareCopy: $('place-share-copy'),
  btnAddPlace: $('btn-add-place'),
  challengeBanner: $('challenge-banner'),
  endBonus: $('end-bonus'), endChallenge: $('end-challenge'),
  crewModal: $('crew-modal'), crewName: $('crew-name'), crewMembers: $('crew-members'), crewShare: $('crew-share'),
  btnCrew: $('btn-crew'), lbFilter: $('lb-filter'), lbFilterAll: $('lb-filter-all'), lbFilterCrew: $('lb-filter-crew'), lbCrewName: $('lb-crew-name'),
  nextCountdown: $('next-countdown'),
  acctDisabled: $('acct-disabled'), acctSignedOut: $('acct-signedout'), acctSignedIn: $('acct-signedin'),
  acctEmail: $('acct-email'), acctSendLink: $('acct-sendlink'),
  acctEmailLabel: $('acct-email-label'), acctSync: $('acct-sync'), acctSignOut: $('acct-signout'), acctStatus: $('acct-status'),
  startPlayer: $('start-player'), setPlayerName: $('set-player-name'), btnSwitchPlayer: $('btn-switch-player'),
  scoreValue: $('score-value'), puzzleNumber: $('puzzle-number'), puzzleDate: $('puzzle-date'),
  btnHelp: $('btn-help'), btnSettings: $('btn-settings'),
  helpModal: $('help-modal'), settingsModal: $('settings-modal'),
  setMiles: $('set-miles'), setDoubleTap: $('set-doubletap'), setSound: $('set-sound'), setMusic: $('set-music'), setAutoRotate: $('set-autorotate'),
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
    if (audioCtx.state === 'suspended') audioCtx.resume();
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
// Arrow-flight confirm: a noise whoosh sweeping down, landing with a thunk.
function arrowSound() {
  if (!settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    // whoosh: filtered noise, band sweeping 3200 -> 350 Hz
    const len = 0.28;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(3200, t0);
    bp.frequency.exponentialRampToValueAtTime(350, t0 + len);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(bp).connect(g).connect(audioCtx.destination);
    src.start(t0);
    // thunk: pitch-dropping sine hit right as the whoosh lands
    const hit = audioCtx.createOscillator();
    hit.type = 'sine';
    const tHit = t0 + 0.2;
    hit.frequency.setValueAtTime(220, tHit);
    hit.frequency.exponentialRampToValueAtTime(70, tHit + 0.12);
    const hg = audioCtx.createGain();
    hg.gain.setValueAtTime(0.0001, tHit);
    hg.gain.linearRampToValueAtTime(0.22, tHit + 0.008);
    hg.gain.exponentialRampToValueAtTime(0.0001, tHit + 0.22);
    hit.connect(hg).connect(audioCtx.destination);
    hit.start(tHit);
    hit.stop(tHit + 0.3);
  } catch { /* audio unavailable */ }
}

const sounds = {
  tap: () => blip(520, 70, 'sine'),
  confirm: () => arrowSound(),
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
  for (let i = 0; i < session.locations.length; i++) {
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
  session = new GameSession(seed, isPractice, isPractice ? practiceExcludeSet() : null);
  if (!isPractice) {
    // Never deal a player the family place they authored - they know the answer.
    const familyPlace = familyPlaceForPuzzle(puzzleNumberForToday(), getActivePlayer());
    if (familyPlace) session.appendFamilyRound(familyPlace);
  }
  noteLocationsSeen(session.locations.filter((l) => !l.isFamily).map((l) => l.name));
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
  if (settings.music) startMusic();
  beginRound();
}

function beginRound() {
  const loc = session.currentLocation;
  els.promptPlace.textContent = loc.name;
  const mult = session.currentMultiplier;
  const labelEl = document.querySelector('#prompt-card .prompt-label');
  if (loc.isFamily) {
    labelEl.textContent = '🏠 Family round — tap where this is…';
    els.promptCard.classList.add('family-round');
    els.promptSub.innerHTML = `<span class="mult-chip">×${mult} bonus</span>` +
      (loc.by ? ` · added by ${loc.by.replace(/[<>&]/g, '')}` : '');
  } else {
    labelEl.textContent = 'Tap where you think this is…';
    els.promptCard.classList.remove('family-round');
    els.promptSub.innerHTML = `Round ${session.roundIndex + 1} of ${ROUNDS_PER_GAME}` +
      (mult > 1 ? ` · <span class="mult-chip">×${mult} points</span>` : '');
  }
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
  if (placingPlace) { finalizePlace(); return; }
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
    els.resultPoints.textContent = result.multiplier > 1
      ? `+${result.points} (${result.score}×${result.multiplier})`
      : `+${result.points}`;
    els.resultVerdict.textContent = verdictForResult(result);
    els.resultFact.textContent = result.target.fact || '';
    els.btnNext.textContent = session.roundIndex + 1 >= ROUNDS_PER_GAME ? 'See results →' : 'Next →';
    show(els.resultPanel);
    renderRoundDots();
    flyPoints(`+${result.points}`);
    setScoreDisplay(prevTotal + result.points, prevTotal);
    if (result.bullseye) burstConfetti(60);
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
  stopMusic();
  sounds.fanfare();

  const total = session.totalScore;
  const bonus = session.bonusScore;
  const rounds = session.results.map((r) => ({
    name: r.target.name,
    score: r.score,
    points: r.points,
    multiplier: r.multiplier,
    distanceKm: Math.round(r.distanceKm),
    guess: { lat: r.guess.lat, lng: r.guess.lng },
    b: r.isBonus ? 1 : 0,
  }));

  const player = getActivePlayer();
  const prevBest = computeStreak().best; // before this game is recorded
  if (!session.isPractice) {
    recordDailyResult(puzzleNumberForToday(), rounds, total);
    const emojis = session.results.filter((r) => !r.isBonus).map((r) => emojiForScore(r.score)).join('');
    if (player) recordPlayerResult(player, puzzleNumberForToday(), total, emojis, bonus);
    if (total > prevBest && prevBest > 0) {
      burstConfetti(110);
      toast(`🎉 New personal best: ${total}!`, 3000);
    }
    startNextCountdown();
    runSync('auto'); // cloud backup when signed in; no-op otherwise
  } else {
    hide(els.nextCountdown);
  }

  // Family bonus line
  if (bonus > 0) {
    els.endBonus.textContent = `🏠 Family round bonus: +${bonus}`;
    show(els.endBonus);
  } else {
    hide(els.endBonus);
  }

  // Challenge verdict
  hide(els.endChallenge);
  if (!session.isPractice && player) {
    const c = getChallenge(puzzleNumberForToday());
    if (c && c.n.toLowerCase() !== player.toLowerCase()) {
      const diff = total - c.s;
      els.endChallenge.textContent =
        diff > 0 ? `🏆 You beat ${c.n}'s ${c.s} by ${diff}!` :
        diff === 0 ? `🤝 Dead tie with ${c.n} at ${c.s}!` :
        `😤 ${c.n}'s ${c.s} stands — you were ${-diff} short.`;
      show(els.endChallenge);
    }
  }

  els.endTitle.textContent = session.isPractice
    ? 'Practice complete!'
    : `MTap #${puzzleNumberForToday()} complete!`;
  els.endScoreValue.textContent = total;
  els.endEmoji.textContent = session.results.map((r) => emojiForScore(r.score)).join(' ');

  els.endRounds.innerHTML = '';
  session.results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'end-round-row';
    row.innerHTML = `
      <span>${emojiForScore(r.score)}</span>
      <span class="rr-name"></span>
      <span class="rr-mult">${r.multiplier > 1 ? '×' + r.multiplier : ''}</span>
      <span class="rr-dist"></span>
      <span class="rr-pts">+${r.points}</span>`;
    row.querySelector('.rr-name').textContent = r.target.name;
    row.querySelector('.rr-dist').textContent = `${r.score}% · ${formatDistance(r.distanceKm, settings.miles)}`;
    row.addEventListener('click', () => enterOverview(i));
    els.endRounds.appendChild(row);
  });

  const stats = computeStreak();
  els.endStats.innerHTML = session.isPractice
    ? ''
    : `🔥 Streak: <b>${stats.streak}</b> · Played: <b>${stats.played}</b> · Best: <b>${stats.best}</b> · Avg: <b>${stats.average}</b>`;

  show(els.endScreen);
  renderOnThisDay();
}

function showEndScreenForRecorded(record) {
  // Rebuild the end screen from a stored daily result (revisiting after playing).
  els.endTitle.textContent = `MTap #${puzzleNumberForToday()} — already played today!`;
  els.endScoreValue.textContent = record.total;
  hide(els.endChallenge);
  const recBonus = (record.rounds || []).filter((r) => r.b).reduce((a, r) => a + (r.points || 0), 0);
  if (recBonus > 0) {
    els.endBonus.textContent = `🏠 Family round bonus: +${recBonus}`;
    show(els.endBonus);
  } else {
    hide(els.endBonus);
  }
  els.endEmoji.textContent = record.rounds.map((r) => emojiForScore(r.score)).join(' ');
  els.endRounds.innerHTML = '';
  record.rounds.forEach((r, i) => {
    const pts = r.points != null ? r.points : r.score; // old records predate multipliers
    const row = document.createElement('div');
    row.className = 'end-round-row';
    row.innerHTML = `
      <span>${emojiForScore(r.score)}</span>
      <span class="rr-name"></span>
      <span class="rr-mult">${r.multiplier > 1 ? '×' + r.multiplier : ''}</span>
      <span class="rr-dist"></span>
      <span class="rr-pts">+${pts}</span>`;
    row.querySelector('.rr-name').textContent = r.name;
    row.querySelector('.rr-dist').textContent = `${r.score}% · ${formatDistance(r.distanceKm, settings.miles)}`;
    row.addEventListener('click', () => enterOverview(i));
    els.endRounds.appendChild(row);
  });
  const stats = computeStreak();
  els.endStats.innerHTML =
    `🔥 Streak: <b>${stats.streak}</b> · Played: <b>${stats.played}</b> · Best: <b>${stats.best}</b> · Avg: <b>${stats.average}</b>`;
  hide(els.startScreen);
  show(els.endScreen);
  globe.setAutoRotate(settings.autoRotate);
  startNextCountdown();
  renderOnThisDay();
}

// ---------- post-game overview (spin the globe, read about the places) ----------

let overviewItems = null;
let overviewIndex = 0;

function buildOverviewItems() {
  // Prefer the live session; otherwise reconstruct today's daily from the stored
  // record + the deterministic daily pick (same seed -> same 5 locations).
  if (session && session.results.length === ROUNDS_PER_GAME) {
    return session.results.map((r) => ({
      lat: r.target.lat, lng: r.target.lng, name: r.target.name, fact: r.target.fact || '',
      guess: r.guess, distanceKm: r.distanceKm,
      score: r.score, points: r.points, multiplier: r.multiplier,
    }));
  }
  const record = dailyAlreadyPlayed(puzzleNumberForToday());
  if (!record) return null;
  const locs = pickLocations(dailySeed());
  // Only the 5 standard rounds reconstruct from the daily seed; a stored family
  // bonus round has no seed-derived location, so it's skipped on revisit.
  return record.rounds.slice(0, locs.length).filter((r) => !r.b).map((r, i) => ({
    lat: locs[i].lat, lng: locs[i].lng, name: r.name, fact: locs[i].fact || '',
    guess: r.guess || null, distanceKm: r.distanceKm,
    score: r.score, points: r.points != null ? r.points : r.score,
    multiplier: r.multiplier || multiplierForRound(i),
  }));
}

function enterOverview(startIndex = 0) {
  overviewItems = buildOverviewItems();
  if (!overviewItems) { toast('Play today\'s game first! 🌍'); return; }
  hide(els.endScreen);
  hide(els.promptCard);
  globe.setAutoRotate(false);
  globe.setInteractive(false);
  globe.clearResults();
  globe.clearPin();
  globe.showOverview(overviewItems);
  show(els.overviewPanel);
  selectOverviewIndex(startIndex);
}

let ovFetchToken = 0;

function selectOverviewIndex(i) {
  overviewIndex = ((i % overviewItems.length) + overviewItems.length) % overviewItems.length;
  const item = overviewItems[overviewIndex];
  els.ovRound.textContent = `Location ${overviewIndex + 1} of ${overviewItems.length}` +
    (item.multiplier > 1 ? ` · ×${item.multiplier}` : '');
  els.ovName.textContent = item.name;
  els.ovMeta.textContent = `${emojiForScore(item.score)} Your guess: ${formatDistance(item.distanceKm, settings.miles)} away · +${item.points} pts`;
  els.ovFact.textContent = item.fact;
  globe.selectOverview(overviewIndex);

  // Wikipedia photo + extract, guarded against rapid navigation races.
  hide(els.ovWiki);
  const token = ++ovFetchToken;
  fetchWikiSummary(item.name).then((wiki) => {
    if (token !== ovFetchToken || !wiki) return;
    els.ovWikiExtract.textContent = wiki.extract;
    if (wiki.thumbnail) {
      els.ovWikiImg.src = wiki.thumbnail;
      show(els.ovWikiImg);
    } else {
      hide(els.ovWikiImg);
    }
    if (wiki.url) { els.ovWikiLink.href = wiki.url; show(els.ovWikiLink); }
    else hide(els.ovWikiLink);
    show(els.ovWiki);
  });
}

function exitOverview() {
  hide(els.overviewPanel);
  globe.clearOverview();
  overviewItems = null;
  show(els.endScreen);
  globe.setAutoRotate(settings.autoRotate);
}

// "On this day in history" on the end screen (Wikipedia on-this-day feed):
// one featured story with a photo and a short article extract, then the rest as lines.
async function renderOnThisDay() {
  const events = await fetchOnThisDay(4);
  if (!events || !events.length) { hide(els.onThisDay); return; }
  els.otdItems.innerHTML = '';

  const featuredIdx = events.findIndex((e) => e.thumbnail && e.extract);
  const featured = featuredIdx >= 0 ? events[featuredIdx] : null;
  const rest = events.filter((_, i) => i !== featuredIdx).slice(0, 3);

  if (featured) {
    const card = document.createElement('div');
    card.className = 'otd-featured';
    card.innerHTML = `
      <img class="otd-featured-img" alt="" />
      <div class="otd-featured-head"><span class="otd-year">${featured.year}</span> <span class="otd-featured-text"></span></div>
      <div class="otd-featured-extract"></div>
      <a class="ov-wiki-link" target="_blank" rel="noopener">Read the full story →</a>`;
    card.querySelector('.otd-featured-img').src = featured.thumbnail;
    card.querySelector('.otd-featured-text').textContent = featured.text;
    card.querySelector('.otd-featured-extract').textContent = featured.extract;
    const link = card.querySelector('.ov-wiki-link');
    if (featured.url) link.href = featured.url; else link.remove();
    els.otdItems.appendChild(card);
  }

  rest.forEach((ev) => {
    const row = document.createElement('div');
    row.className = 'otd-item';
    const thumb = ev.thumbnail ? `<img class="otd-thumb" alt="" />` : '';
    row.innerHTML = `<span class="otd-year">${ev.year}</span><span class="otd-text"></span>${thumb}`;
    const textEl = row.querySelector('.otd-text');
    if (ev.url) {
      const a = document.createElement('a');
      a.href = ev.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = ev.text;
      textEl.appendChild(a);
    } else {
      textEl.textContent = ev.text;
    }
    const img = row.querySelector('.otd-thumb');
    if (img) img.src = ev.thumbnail;
    els.otdItems.appendChild(row);
  });
  show(els.onThisDay);
}

// ---------- social: profiles, leaderboard, family places, challenges ----------

let placingPlace = null; // { name, fact } while pinning a new family place
let lbShowCrewOnly = false;

// Native share sheet when available (iPhone: opens Messages/contacts directly);
// clipboard fallback everywhere else.
async function shareOrCopy(text, copiedToast) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; /* else fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(copiedToast || 'Copied! 📋');
  } catch {
    toast('Could not copy — ' + text.slice(0, 100), 5000);
  }
}

// Celebration confetti (bullseyes + personal bests)
function burstConfetti(count = 70) {
  const colors = ['#4da3ff', '#4ade80', '#fbbf24', '#ff4d6d', '#a78bfa', '#f0f4ff'];
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('div');
    bit.className = 'confetti-bit';
    bit.style.left = Math.random() * 100 + 'vw';
    bit.style.background = colors[Math.floor(Math.random() * colors.length)];
    const dur = 1.6 + Math.random() * 1.6;
    bit.style.animationDuration = dur + 's';
    bit.style.animationDelay = Math.random() * 0.5 + 's';
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(bit);
    setTimeout(() => bit.remove(), (dur + 0.6) * 1000);
  }
}

// Wordle-style countdown to the next daily puzzle (local midnight).
let countdownTimer = null;
function startNextCountdown() {
  clearInterval(countdownTimer);
  const tick = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = midnight - now;
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    els.nextCountdown.innerHTML = `Next MTap in <b>${h}:${m}:${s}</b>`;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
  show(els.nextCountdown);
}

// --- crew (friend group) ---

function renderCrewModal() {
  const crew = getCrew();
  els.crewName.value = crew.name;
  els.crewMembers.innerHTML = '';
  const known = Object.values(getPlayers());
  // Crew members not seen as players yet still get chips (so imports show).
  const names = new Map();
  known.forEach((p) => names.set(p.name.toLowerCase(), p.name));
  crew.members.forEach((m) => names.set(m.toLowerCase(), m));
  if (!names.size) {
    els.crewMembers.innerHTML = '<div class="crew-hint">Nobody to add yet.</div>';
    return;
  }
  for (const name of names.values()) {
    const chip = document.createElement('button');
    chip.className = 'crew-chip' + (isCrewMember(name) ? ' in' : '');
    chip.textContent = (isCrewMember(name) ? '✓ ' : '') + name;
    chip.addEventListener('click', () => {
      const crewNow = getCrew();
      crewNow.name = els.crewName.value.trim().slice(0, 24);
      saveCrew(crewNow);
      toggleCrewMember(name);
      renderCrewModal();
    });
    els.crewMembers.appendChild(chip);
  }
}

function shareCrewLink() {
  const crew = getCrew();
  crew.name = els.crewName.value.trim().slice(0, 24) || 'Our crew';
  saveCrew(crew);
  if (!crew.members.length) { toast('Tap some names into the crew first 👥'); return; }
  const link = `${shareBaseUrl()}#mt=${encodePayload(buildCrewPayload())}`;
  shareOrCopy(
    `👥 Join "${crew.name}" on MTap — our own leaderboard group! Open this and we're all connected: ${link}`,
    'Crew link copied! 📋'
  );
}

function refreshPlayerUI() {
  const name = getActivePlayer();
  els.setPlayerName.textContent = name || '—';
  els.startPlayer.innerHTML = '';
  if (name) {
    const span = document.createElement('span');
    span.append('Playing as ');
    const b = document.createElement('b');
    b.textContent = name;
    span.appendChild(b);
    span.append(' · ');
    const a = document.createElement('a');
    a.textContent = 'Switch player';
    a.addEventListener('click', () => openNameModal(true));
    span.appendChild(a);
    els.startPlayer.appendChild(span);
  }
  // Personalized greeting + streak
  const stats = computeStreak();
  if (name && stats.played > 0) {
    els.startStreak.innerHTML = `Welcome back, <b></b>! 🔥 Streak: <b>${stats.streak}</b> · Best: <b>${stats.best}</b>`;
    els.startStreak.querySelector('b').textContent = name;
  } else if (name) {
    els.startStreak.innerHTML = `Good luck, <b></b>! First game — make it count 🌍`;
    els.startStreak.querySelector('b').textContent = name;
  }
  // Challenge banner (only until they play today)
  const c = getChallenge(puzzleNumberForToday());
  if (c && c.n !== name && !dailyAlreadyPlayed(puzzleNumberForToday())) {
    els.challengeBanner.textContent = `🎯 ${c.n} scored ${c.s} today — beat it!`;
    show(els.challengeBanner);
  } else {
    hide(els.challengeBanner);
  }
}

function openNameModal(isSwitch) {
  els.nameTitle.textContent = isSwitch ? 'Who\'s playing now?' : 'Who\'s playing?';
  els.nameInput.value = '';
  els.nameKnown.innerHTML = '';
  const players = Object.values(getPlayers()).filter((p) => p.isLocal);
  players.forEach((p) => {
    const chip = document.createElement('button');
    chip.className = 'name-chip';
    chip.textContent = p.name;
    chip.addEventListener('click', () => saveName(p.name));
    els.nameKnown.appendChild(chip);
  });
  show(els.nameModal);
  setTimeout(() => els.nameInput.focus(), 150);
}

function saveName(raw) {
  const name = setActivePlayer(raw);
  if (!name) { toast('Type a name first 🙂'); return; }
  hide(els.nameModal);
  migrateHistoryToPlayer(name);
  refreshPlayerUI();
  toast(`Welcome, ${name}! 🌍`);
}

// One-time: attribute this device's pre-profile results to the first profile.
function migrateHistoryToPlayer(name) {
  const players = getPlayers();
  const hasResults = Object.values(players).some((p) => Object.keys(p.results || {}).length);
  if (hasResults) return;
  const history = loadHistoryForMigration();
  for (const [n, rec] of Object.entries(history)) {
    const emojis = (rec.rounds || []).filter((r) => !r.b).map((r) => emojiForScore(r.score)).join('');
    recordPlayerResult(name, Number(n), rec.total, emojis, 0);
  }
}

function loadHistoryForMigration() {
  try { return JSON.parse(localStorage.getItem('marctap.history')) || {}; } catch { return {}; }
}

function renderLeaderboard() {
  const pn = puzzleNumberForToday();
  els.lbTodayLabel.textContent = `MTap #${pn} · ${todayDateText()}`;
  els.lbRows.innerHTML = '';
  const crew = getCrew();
  if (crew.members.length) {
    show(els.lbFilter);
    els.lbCrewName.textContent = crew.name || 'My crew';
    els.lbFilterAll.classList.toggle('active', !lbShowCrewOnly);
    els.lbFilterCrew.classList.toggle('active', lbShowCrewOnly);
  } else {
    hide(els.lbFilter);
    lbShowCrewOnly = false;
  }
  let rows = leaderboardRows(pn);
  if (lbShowCrewOnly) rows = rows.filter((r) => isCrewMember(r.name));
  const me = getActivePlayer();
  if (!rows.length) {
    els.lbRows.innerHTML = '<div class="lb-hint">No scores yet — play today\'s game!</div>';
    return;
  }
  rows.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (i === 0 && r.today !== null ? ' rank1' : '') + (me && r.name.toLowerCase() === me.toLowerCase() ? ' me' : '');
    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = r.today !== null ? ['🥇', '🥈', '🥉'][i] || `${i + 1}.` : '·';
    const nameEl = document.createElement('span');
    nameEl.className = 'lb-name';
    nameEl.textContent = (isCrewMember(r.name) ? '👥 ' : '') + r.name;
    if (r.streak > 1) {
      const s = document.createElement('small');
      s.textContent = `🔥${r.streak}`;
      nameEl.appendChild(s);
    }
    const today = document.createElement('span');
    today.className = 'lb-today';
    today.textContent = r.today !== null ? r.today + (r.bonus ? ` +${r.bonus}🏠` : '') : '—';
    const stats = document.createElement('span');
    stats.className = 'lb-stats';
    stats.textContent = `best ${r.best} · avg ${r.avg} · ${r.played} played`;
    row.append(rank, nameEl, today, stats);
    els.lbRows.appendChild(row);
  });
}

function openLeaderboard() { renderLeaderboard(); show(els.lbModal); }

// --- add-a-family-place flow ---

function startPlacePinning() {
  const name = els.placeName.value.trim();
  if (!name) { toast('Give the place a name first 🙂'); return; }
  placingPlace = { name, fact: els.placeFact.value.trim() };
  hide(els.placeModal);
  hide(els.startScreen);
  globe.setAutoRotate(false);
  globe.setInteractive(true);
  els.promptPlace.textContent = name;
  els.promptSub.textContent = 'Pin the exact spot, then confirm';
  document.querySelector('#prompt-card .prompt-label').textContent = '🏠 Tap the globe to place it';
  els.promptCard.classList.add('family-round');
  show(els.promptCard);
  toast('Tap the globe, drag the pin, then Confirm 📍', 3200);
}

// Shared save path for both entry modes (geocoded and hand-pinned).
function savePlaceAt(name, fact, lat, lng) {
  const saved = addFamilyPlace({ name, lat, lng, fact, by: getActivePlayer() || '' });
  const link = `${shareBaseUrl()}#mt=${encodePayload(buildPlacePayload(saved))}`;
  els.placeShareSummary.textContent = `"${saved.name}" is now a ×2 bonus round in your daily games${saved.by ? ` (added by ${saved.by})` : ''}.`;
  els.placeShareCopy.onclick = () =>
    shareOrCopy(`🏠 I added "${saved.name}" to our MTap family map! Open to get it in your game: ${link}`, 'Link copied! 📋');
  show(els.placeShareModal);
  globe.flyTo(lat, lng, 2.0);
  return saved;
}

function finalizePlace() {
  const pin = globe.getPin();
  if (!pin || !placingPlace) return;
  const { name, fact } = placingPlace;
  placingPlace = null;
  hide(els.confirmBar);
  hide(els.promptCard);
  els.promptCard.classList.remove('family-round');
  globe.clearPin();
  globe.setInteractive(false);
  savePlaceAt(name, fact, pin.lat, pin.lng);
  show(els.startScreen);
  globe.setAutoRotate(settings.autoRotate);
}

// Geocoded entry: type "city, state/country" -> validate -> the app pins it.
async function findPlaceByText() {
  const name = els.placeName.value.trim();
  if (!name) { toast('Give the place a name first 🙂'); return; }
  const q = els.placeLoc.value.trim();
  if (!q) { toast('Type the city and state/country 🌍'); return; }
  els.placeResults.innerHTML = '<div class="place-searching">Searching the map…</div>';
  const results = await geocodePlace(q);
  els.placeResults.innerHTML = '';
  if (!results || !results.length) {
    els.placeResults.innerHTML =
      '<div class="place-searching">Couldn\'t find that — try "City, State" or "City, Country", or pin it manually below.</div>';
    return;
  }
  results.forEach((r) => {
    els.placeResults.appendChild(placeResultChip(name, r));
  });
}

function placeResultChip(name, r) {
  const btn = document.createElement('button');
  btn.className = 'place-result';
  btn.innerHTML = `📍 <span class="pr-label"></span><small>Tap to use this location</small>`;
  btn.querySelector('.pr-label').textContent = r.label;
  btn.addEventListener('click', () => {
    hide(els.placeModal);
    savePlaceAt(name, els.placeFact.value.trim(), r.lat, r.lng);
  });
  return btn;
}

// Photo entry: read the GPS embedded in a photo's EXIF (in the browser - the
// photo never leaves the device), reverse-geocode a friendly label, offer it.
async function findPlaceByPhoto(file) {
  const name = els.placeName.value.trim();
  if (!name) { toast('Give the place a name first 🙂'); els.placePhoto.value = ''; return; }
  if (!file) return;
  els.placeResults.innerHTML = '<div class="place-searching">Reading the photo\'s location…</div>';
  const loc = await extractPhotoLocation(file);
  if (!loc) {
    els.placeResults.innerHTML =
      '<div class="place-searching">No location saved in that photo. (Photos sent through Messages/WhatsApp usually have it stripped — try picking the original from your photo library, or type the city above.)</div>';
    els.placePhoto.value = '';
    return;
  }
  const label = (await reverseGeocode(loc.lat, loc.lng)) ||
    `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
  els.placeResults.innerHTML = '';
  els.placeResults.appendChild(placeResultChip(name, { label: `Photo location: ${label}`, lat: loc.lat, lng: loc.lng }));
  els.placePhoto.value = '';
}

// --- incoming share links ---

function processIncomingPayload() {
  const p = readHashPayload();
  if (!p) return;
  if (p.t === 'r') {
    const r = importResultPayload(p);
    if (r) {
      if (r.puzzle === puzzleNumberForToday()) setChallenge(r.name, r.puzzle, r.score);
      toast(`🏆 ${r.name}'s ${r.score} added to your leaderboard!`, 3200);
    }
  } else if (p.t === 'l') {
    const place = importPlacePayload(p);
    if (place) {
      toast(`🏠 "${place.name}" added to your family map!`, 3200);
    }
  } else if (p.t === 'c') {
    const crew = importCrewPayload(p);
    if (crew) {
      toast(`👥 You're in "${crew.name || 'the crew'}"! Leaderboard grouped.`, 3200);
    }
  }
  refreshPlayerUI();
}

// ---------- accounts (only active when Firebase is configured) ----------

function fmtSyncTime() {
  const t = lastSyncTime();
  return t ? `Last synced ${new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '';
}

function initAccountUI() {
  if (!accountsEnabled) return; // the "coming soon" note stays visible
  hide(els.acctDisabled);
  show(els.acctSignedOut);
  onAuthChange((user) => {
    if (user) {
      hide(els.acctSignedOut);
      show(els.acctSignedIn);
      els.acctEmailLabel.textContent = `Signed in as ${user.email}`;
      els.acctStatus.textContent = fmtSyncTime();
      runSync('auto');
    } else {
      show(els.acctSignedOut);
      hide(els.acctSignedIn);
    }
    refreshPlayerUI();
  });

  els.acctSendLink.addEventListener('click', async () => {
    const email = els.acctEmail.value.trim();
    if (!email) { toast('Type your email first 📧'); return; }
    els.acctSendLink.disabled = true;
    const r = await sendLoginLink(email);
    els.acctSendLink.disabled = false;
    if (r.ok) {
      toast('Check your email — tap the link to sign in ✉️', 4500);
      els.acctEmail.value = '';
    } else {
      toast(r.error, 3500);
    }
  });
  els.acctEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.acctSendLink.click(); });
  els.acctSync.addEventListener('click', () => runSync('manual'));

  // If this page load came from a sign-in link, finish the login now.
  completeLoginLink().then((r) => {
    if (r.ok) toast('Signed in! Syncing your game ☁️', 3500);
    else if (r.error && !r.silent) toast(r.error, 3500);
  });
  els.acctSignOut.addEventListener('click', async () => {
    await signOutUser();
    toast('Signed out');
  });
}

async function runSync(kind) {
  if (!accountsEnabled || !currentUser()) return;
  const r = await syncNow();
  if (r.ok) {
    els.acctStatus.textContent = fmtSyncTime();
    if (kind === 'manual') toast('Synced across your devices ☁️');
    refreshPlayerUI();
  } else if (kind === 'manual') {
    toast(r.error, 3500);
  }
}

// ---------- share ----------

async function shareScore() {
  const pn = puzzleNumberForToday();
  const player = getActivePlayer() || 'Someone';
  let total, bonus, isPractice, mainScores;
  if (session && session.results.length >= ROUNDS_PER_GAME) {
    total = session.totalScore;
    bonus = session.bonusScore;
    mainScores = session.results.filter((r) => !r.isBonus).map((r) => r.score);
    isPractice = session.isPractice;
  } else {
    const record = dailyAlreadyPlayed(pn);
    if (!record) return;
    total = record.total;
    bonus = (record.rounds || []).filter((r) => r.b).reduce((a, r) => a + (r.points || 0), 0);
    mainScores = (record.rounds || []).filter((r) => !r.b).map((r) => r.score);
    isPractice = false;
  }
  // MapTap-style per-guess line: "100🎯 73🔥 62😄 28😑 92🏆"
  const perRound = mainScores.map((s) => `${s}${emojiForScore(s)}`).join(' ');
  const emojis = mainScores.map((s) => emojiForScore(s)).join('');
  let text;
  if (isPractice) {
    text = `${player} scored ${total}/${MAX_GAME_SCORE} on an MTap practice game 🌍\n${perRound}`;
  } else {
    // Result link doubles as a challenge + leaderboard merge for whoever opens it.
    const link = `${shareBaseUrl()}#mt=${encodePayload(buildResultPayload(player, pn, total, emojis, bonus))}`;
    // The family bonus is deliberately OUTSIDE the /1000 total: friends without
    // the family pack compete on the same scale, and the bonus is just bragging.
    text = `${player} scored ${total}/${MAX_GAME_SCORE} on MTap #${pn} 🌍\n${perRound}` +
      (bonus ? `\n🏠 +${bonus} homefield points (family round — doesn't count in the ${MAX_GAME_SCORE})` : '') +
      `\nThink you can beat it? ${link}`;
  }
  await shareOrCopy(text, 'Copied! Paste it in the family chat 📣');
}

// ---------- boot ----------

async function boot() {
  // Header labels
  els.puzzleNumber.textContent = `#${puzzleNumberForToday()}`;
  els.puzzleDate.textContent = todayDateText();
  els.startPuzzleLabel.textContent = `MTap #${puzzleNumberForToday()} · ${todayDateText()}`;

  const stats = computeStreak();
  if (stats.played > 0) {
    els.startStreak.innerHTML = `🔥 Streak: <b>${stats.streak}</b> · Games played: <b>${stats.played}</b> · Best score: <b>${stats.best}</b>`;
  }

  // Settings UI
  els.setMiles.checked = settings.miles;
  els.setDoubleTap.checked = settings.doubleTap;
  els.setSound.checked = settings.sound;
  els.setMusic.checked = settings.music;
  els.setAutoRotate.checked = settings.autoRotate;

  // Globe
  globe = new Globe(document.getElementById('globe-container'), {
    onTap: onGlobeTap,
    onDoubleTap: onGlobeDoubleTap,
    onOverviewSelect: (i) => selectOverviewIndex(i),
  });
  globe.setAutoRotate(settings.autoRotate);

  const geojson = await loadCountries(`${import.meta.env.BASE_URL}data/countries-50m.geojson`);
  await globe.init(geojson);
  globe.cinematicIntro(); // swoop in from deep space once the real Earth is painted

  // Social boot: import any share-link payload (needs country data), then profiles.
  processIncomingPayload();
  window.addEventListener('hashchange', processIncomingPayload);

  // iOS: every tap re-blesses audio (silent-switch bypass + resume after calls/
  // interruptions). Cheap no-op when already unlocked.
  window.addEventListener('pointerdown', unlockIosAudio, { passive: true });
  if (!getActivePlayer()) {
    setTimeout(() => openNameModal(false), 400);
  }
  refreshPlayerUI();

  els.btnLeaderboard.addEventListener('click', openLeaderboard);
  els.btnEndLeaderboard.addEventListener('click', openLeaderboard);
  els.btnAddPlace.addEventListener('click', () => {
    els.placeName.value = '';
    els.placeFact.value = '';
    els.placeLoc.value = '';
    els.placeResults.innerHTML = '';
    show(els.placeModal);
    setTimeout(() => els.placeName.focus(), 150);
  });
  els.placeFind.addEventListener('click', findPlaceByText);
  els.placeLoc.addEventListener('keydown', (e) => { if (e.key === 'Enter') findPlaceByText(); });
  els.placePhoto.addEventListener('change', () => findPlaceByPhoto(els.placePhoto.files[0]));
  els.placePinManual.addEventListener('click', (e) => { e.preventDefault(); startPlacePinning(); });
  els.btnCrew.addEventListener('click', () => { hide(els.lbModal); renderCrewModal(); show(els.crewModal); });
  els.crewShare.addEventListener('click', shareCrewLink);
  els.crewName.addEventListener('change', () => {
    const crew = getCrew();
    crew.name = els.crewName.value.trim().slice(0, 24);
    saveCrew(crew);
  });
  els.lbFilterAll.addEventListener('click', () => { lbShowCrewOnly = false; renderLeaderboard(); });
  els.lbFilterCrew.addEventListener('click', () => { lbShowCrewOnly = true; renderLeaderboard(); });
  els.btnSwitchPlayer.addEventListener('click', () => { hide(els.settingsModal); openNameModal(true); });
  els.nameSave.addEventListener('click', () => saveName(els.nameInput.value));
  els.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(els.nameInput.value); });
  initAccountUI();

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
  els.btnExplore.addEventListener('click', () => enterOverview(0));
  els.ovPrev.addEventListener('click', () => selectOverviewIndex(overviewIndex - 1));
  els.ovNext.addEventListener('click', () => selectOverviewIndex(overviewIndex + 1));
  els.ovBack.addEventListener('click', exitOverview);

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

  // Keyboard shortcuts: arrows nudge, Enter confirms; in overview, arrows browse.
  window.addEventListener('keydown', (e) => {
    if (overviewItems && !els.overviewPanel.classList.contains('hidden')) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); selectOverviewIndex(overviewIndex - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); selectOverviewIndex(overviewIndex + 1); }
      else if (e.key === 'Escape') exitOverview();
      return;
    }
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
      music: els.setMusic.checked,
      autoRotate: els.setAutoRotate.checked,
    };
    saveSettings(settings);
    if (!session || session.isOver) globe.setAutoRotate(settings.autoRotate);
    // Music toggle takes effect immediately, even mid-game.
    if (!settings.music) stopMusic();
    else if (session && !session.isOver) startMusic();
  };
  [els.setMiles, els.setDoubleTap, els.setSound, els.setMusic, els.setAutoRotate].forEach((el) =>
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
