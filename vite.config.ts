import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  // 專案根目錄下的 public/ 是 Hugo 的建置輸出（142+ 頁），不是 Vite 的靜態資源目錄。
  // 沒關掉的話 Vite 每次 build 都會把整個 Hugo 網站複製進 outDir。
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'static/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'place-helper': resolve(__dirname, 'src/tools/place-helper/place-helper.html'),
        'adventure-map': resolve(__dirname, 'src/apps/adventure-map/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'adventure-map') {
            return 'js/[name].bundle.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                return 'assets/[name]-[hash].[ext]';
            }
            return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
