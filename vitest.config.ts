import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '~/drizzle', replacement: resolve(__dirname, 'drizzle') },
      { find: '~', replacement: resolve(__dirname, 'app') },
    ],
  },
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
