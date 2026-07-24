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

export const FIREBASE_CONFIG = null;
