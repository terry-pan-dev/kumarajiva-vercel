import { vitePlugin as remix } from '@remix-run/dev';
import { installGlobals } from '@remix-run/node';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { vercelPreset } from '@vercel/remix/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

installGlobals();

export default defineConfig({
  server: {
    port: 3000,
  },

  plugins: [
    remix({ presets: [vercelPreset()] }),
    tsconfigPaths(),
    sentryVitePlugin({
      org: 'qubit-pi',
      project: 'javascript-remix',
      telemetry: process.env.NODE_ENV === 'production',
    }),
  ],

  build: {
    sourcemap: true,
  },
});
