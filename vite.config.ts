import { readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * 打包時列出 public/models/ 底下有哪些 .glb，正式版只去載入存在的檔案，
 * 避免 Console 出現一排 404。開發模式不用這份清單（直接嘗試載入），放新模型不必重開伺服器。
 */
function modelList(): Plugin {
  const id = 'virtual:model-list';
  return {
    name: 'model-list',
    resolveId: (source) => (source === id ? '\0' + id : null),
    load(source) {
      if (source !== '\0' + id) return null;
      let files: string[] = [];
      try {
        files = readdirSync('public/models').filter((f) => f.endsWith('.glb'));
      } catch {
        /* 沒有資料夾就是空清單 */
      }
      return `export default ${JSON.stringify(files.map((f) => f.replace(/\.glb$/, '')))};`;
    },
  };
}

// GitHub Pages 會把網站放在 /<repo>/ 底下，用 VITE_BASE 指定（例如 "/seal-facility/"）。
// 本機開發不設定時為 "/"。
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [modelList()],
  // open：啟動後自動用預設瀏覽器打開；host：讓同一個 Wi-Fi 的 iPad 也連得到
  server: { host: true, open: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
