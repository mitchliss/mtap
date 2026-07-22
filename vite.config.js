import { defineConfig } from 'vite';

// base './' so the built site works from any folder or host (GitHub Pages, Netlify, a subdirectory, etc.)
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 1200,
  },
});
