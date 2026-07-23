import { defineConfig } from 'vite';

// base './' so the built site works from any folder or host (GitHub Pages, Netlify, a subdirectory, etc.)
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 1200,
  },
  // host: true + allowedHosts: true so the ngrok tunnel (START-MTAP.bat) can reach
  // the preview server (Vite validates the Host header and 403s unknown hosts otherwise).
  preview: {
    host: true,
    port: 5210,
    allowedHosts: true,
  },
});
