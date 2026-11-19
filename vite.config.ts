import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
  optimizeDeps: {
    exclude: ['neon_street_wasm'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
