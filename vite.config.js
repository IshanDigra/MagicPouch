import { defineConfig } from 'vite';

export default defineConfig({
  root: 'chrome-extension',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000
  }
});
