// MTap account sync - Firebase configuration.
//
// Accounts are OFF until this is filled in. To enable (free, ~5 minutes, done
// once by Mitch):
//   1. Go to console.firebase.google.com -> "Add project" (Analytics not needed).
//   2. Build -> Authentication -> Get started -> Sign-in method ->
//      enable "Email/Password".
//   3. Build -> Firestore Database -> Create database (production mode).
//      Then under Rules, paste and publish:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /users/{uid} {
//              allow read, write: if request.auth != null && request.auth.uid == uid;
//            }
//          }
//        }
//   4. Project settings (gear icon) -> Your apps -> "</>" Web app -> register ->
//      copy the firebaseConfig object it shows.
//   5. Replace the `null` below with that object, commit, push. Done - the
//      Account section in Settings goes live for everyone.
//
// Note: a Firebase *web* config is public by design (it identifies the project;
// the Firestore rules above are what protect the data) - safe to commit.

// Configured live 2026-07-24 (project "mtap", user data protected by the
// per-user Firestore rules above; this web config is public by design).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAOE3ELSl3ltP0qrGYwOGaxFAEXHmKFRmQ',
  authDomain: 'mtap-a41a6.firebaseapp.com',
  projectId: 'mtap-a41a6',
  storageBucket: 'mtap-a41a6.firebasestorage.app',
  messagingSenderId: '689481515240',
  appId: '1:689481515240:web:5634759199a27ea8b9c95d',
};
