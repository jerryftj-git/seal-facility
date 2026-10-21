import { defineConfig } from 'vitest/config';

// GitHub Pages 會把網站放在 /<repo>/ 底下，用 VITE_BASE 指定（例如 "/seal-facility/"）。
// 本機開發不設定時為 "/"。
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: { host: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
