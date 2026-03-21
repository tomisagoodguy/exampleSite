import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  build: {
    outDir: resolve(__dirname, 'static/dist'),
    emptyOutDir: false, // Handle this in shell to avoid EBUSY
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
