import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..');
  const API = process.env.VITE_API_PROXY ?? env.VITE_API_PROXY ?? 'http://localhost:8080';
  const ROBOT = process.env.VITE_ROBOT_PROXY ?? env.VITE_ROBOT_PROXY ?? 'http://localhost:5001';
  const proxy = {
    '/api': { target: API, changeOrigin: false },
    '/storage': { target: API, changeOrigin: false },
    '/health': { target: API, changeOrigin: false },
    '/dobot': { target: ROBOT, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/dobot/, '') },
  };

  return {
    envDir: '../..',
    plugins: [react()],
    server: { port: 5173, strictPort: true, host: true, proxy },
    preview: { port: 5173, strictPort: true, host: true, proxy },
    build: { outDir: 'dist', sourcemap: false, target: 'es2020', chunkSizeWarningLimit: 1200 },
  };
});
