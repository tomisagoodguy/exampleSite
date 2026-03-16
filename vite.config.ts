import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/tools/place-helper',
  base: './',
  build: {
    outDir: resolve(__dirname, 'static/tools/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/tools/place-helper/place-helper.html'),
      },
    },
  },
});
