# vendor/

Third-party projects kept beside MTap for reference and for lifting code into `src/`.
Nothing here is built or shipped: Vite only builds `index.html` and `src/`, and the
GitHub Pages workflow does not check out submodules.

## gods-eye-view (git submodule)

- Upstream: https://github.com/bilawalsidhu/gods-eye-view (Bilawal Sidhu)
- Pinned at: 7646568a (2026-11-25). Update with
  `git submodule update --remote vendor/gods-eye-view`, then commit the new pointer.
- Fetch after cloning MTap: `git submodule update --init vendor/gods-eye-view` (~184 MB).
- License: the **source code** is MIT. Its **data is not**: the TeleGeography cable map
  and the Bhote Koshi imagery are CC BY-NC (non-commercial), the OSM extracts are ODbL
  (share-alike), and live feeds (Google Maps tiles, OpenSky, AISStream...) carry their own
  terms and keys. See its `LICENSE` and `DATA_SOURCES.md`.

Rule for MTap: when code is copied from here into `src/`, keep the MIT notice at the top of
the copied file (`Portions (c) 2026 Bilawal Sidhu, MIT - from gods-eye-view <path>`), and
never copy a dataset without checking its row in `DATA_SOURCES.md` first.
