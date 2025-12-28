import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/', // Use '/' for web deployment
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    host: '127.0.0.1',
    strictPort: true,
  }
});
