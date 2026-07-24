// MTap accounts - optional email/password sign-in with cross-device sync.
// Entirely gated on FIREBASE_CONFIG (src/firebase-config.js): when it's null,
// none of this loads and the game stays 100% serverless. When configured, the
// Firebase SDK is loaded on demand from Google's CDN and each user's game data
// (profiles, results, family places, crew, history) syncs to their own private
// Firestore document, merged both ways so no device ever loses data.

import { FIREBASE_CONFIG } from './firebase-config.js';
import { loadJSON, saveJSON } from './game.js';

export const accountsEnabled = !!FIREBASE_CONFIG;

const SDK_VERSION = '10.12.2';
let app = null;
let auth = null;
let db = null;
let authMod = null;
let fsMod = null;
const authListeners = [];

async function ensureFirebase() {
  if (!accountsEnabled) return false;
  if (app) return true;
  const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const [appM, authM, fsM] = await Promise.all([
    import(/* @vite-ignore */ `${base}/firebase-app.js`),
    import(/* @vite-ignore */ `${base}/firebase-auth.js`),
    import(/* @vite-ignore */ `${base}/firebase-firestore.js`),
  ]);
  authMod = authM;
  fsMod = fsM;
  app = appM.initializeApp(FIREBASE_CONFIG);
  auth = authM.getAuth(app);
  db = fsM.getFirestore(app);
  authM.onAuthStateChanged(auth, (user) => {
    for (const cb of authListeners) cb(user);
  });
  return true;
}

export function onAuthChange(cb) {
  authListeners.push(cb);
  // Fire immediately with current state once the SDK is up.
  ensureFirebase().then((ok) => { if (ok) cb(auth.currentUser); }).catch(() => cb(null));
}

function friendlyAuthError(e) {
  const code = (e && e.code) || '';
  if (code.includes('invalid-email')) return 'That email doesn\'t look right.';
  if (code.includes('email-already-in-use')) return 'That email already has an account — try Sign in.';
  if (code.includes('weak-password')) return 'Password needs at least 6 characters.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Email or password doesn\'t match.';
  }
  if (code.includes('too-many-requests')) return 'Too many tries — wait a minute and try again.';
  if (code.includes('network')) return 'Network problem — are you online?';
  return 'Something went wrong: ' + (e && e.message ? e.message : 'unknown error');
}

export async function signUp(email, password) {
  await ensureFirebase();
  try {
    await authMod.createUserWithEmailAndPassword(auth, email, password);
    return { ok: true };
  } catch (e) { return { ok: false, error: friendlyAuthError(e) }; }
}

export async function signIn(email, password) {
  await ensureFirebase();
  try {
    await authMod.signInWithEmailAndPassword(auth, email, password);
    return { ok: true };
  } catch (e) { return { ok: false, error: friendlyAuthError(e) }; }
}

export async function signOutUser() {
  await ensureFirebase();
  await authMod.signOut(auth);
}

export async function resetPassword(email) {
  await ensureFirebase();
  try {
    await authMod.sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch (e) { return { ok: false, error: friendlyAuthError(e) }; }
}

export function currentUser() { return auth ? auth.currentUser : null; }

// ---------- two-way merge sync ----------

// Remote wins only where it's strictly better (higher score) or missing locally;
// local always survives. Then the merged state is written back up.
function mergeRemoteIntoLocal(remote) {
  if (!remote) return;

  const players = loadJSON('social.players', {});
  for (const [key, rp] of Object.entries(remote.players || {})) {
    const lp = players[key] || { name: rp.name, results: {}, isLocal: false };
    for (const [pn, rr] of Object.entries(rp.results || {})) {
      if (!lp.results[pn] || (rr && rr.t > lp.results[pn].t)) lp.results[pn] = rr;
    }
    lp.isLocal = lp.isLocal || !!rp.isLocal;
    players[key] = lp;
  }
  saveJSON('social.players', players);

  const places = loadJSON('social.places', []);
  for (const rp of remote.places || []) {
    if (rp && rp.name && !places.some((p) => p.name.toLowerCase() === rp.name.toLowerCase())) {
      places.push(rp);
    }
  }
  saveJSON('social.places', places);

  const crew = loadJSON('social.crew', { name: '', members: [] });
  const rc = remote.crew || {};
  if (!crew.name && rc.name) crew.name = rc.name;
  for (const m of rc.members || []) {
    if (m && !crew.members.some((x) => x.toLowerCase() === m.toLowerCase())) crew.members.push(m);
  }
  saveJSON('social.crew', crew);

  const history = loadJSON('history', {});
  for (const [pn, rec] of Object.entries(remote.history || {})) {
    if (!history[pn] || (rec && rec.total > history[pn].total)) history[pn] = rec;
  }
  saveJSON('history', history);

  if (!loadJSON('social.active', null) && remote.active) saveJSON('social.active', remote.active);
}

export async function syncNow() {
  const ok = await ensureFirebase();
  if (!ok) return { ok: false, error: 'Accounts not configured.' };
  if (!auth.currentUser) return { ok: false, error: 'Not signed in.' };
  try {
    const ref = fsMod.doc(db, 'users', auth.currentUser.uid);
    const snap = await fsMod.getDoc(ref);
    if (snap.exists()) mergeRemoteIntoLocal(snap.data());
    await fsMod.setDoc(ref, {
      players: loadJSON('social.players', {}),
      places: loadJSON('social.places', []),
      crew: loadJSON('social.crew', { name: '', members: [] }),
      history: loadJSON('history', {}),
      active: loadJSON('social.active', null),
      updated: Date.now(),
    });
    saveJSON('account.lastSync', Date.now());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Sync failed: ' + (e && e.message ? e.message : 'unknown') };
  }
}

export function lastSyncTime() { return loadJSON('account.lastSync', null); }
