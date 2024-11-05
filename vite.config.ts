import { vitePlugin as remix } from '@remix-run/dev';
import { installGlobals } from '@remix-run/node';
import { vercelPreset } from '@vercel/remix/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

installGlobals();

export default defineConfig({
  build: {
    target: ['es2022', 'chrome95', 'firefox95', 'safari15'],
    rollupOptions: {
      external: ['@node-rs/jieba-wasm32-wasi'],
    },
  },
  optimizeDeps: {
    exclude: ['@node-rs/jieba', '@node-rs/jieba-wasm32-wasi'],
    esbuildOptions: {
      target: 'es2022',
      supported: {
        'top-level-await': true,
      },
    },
  },
  esbuild: {
    target: 'es2022',
    supported: {
      'top-level-await': true,
    },
  },
  plugins: [remix({ presets: [vercelPreset()] }), tsconfigPaths()],
});
