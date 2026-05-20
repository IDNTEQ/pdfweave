import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites at /<repo>/. Override at build time
  // (e.g. PLAYGROUND_BASE=/) when deploying to a different host.
  base: process.env.PLAYGROUND_BASE ?? '/pdfweave/',
  build: {
    target: 'esnext',
    sourcemap: true, // Enable source maps for production builds
  },
  plugins: [
    react(),
    sentryVitePlugin({
      org: 'hand-dot',
      project: 'playground-pdfme',
    }),
  ],
});
