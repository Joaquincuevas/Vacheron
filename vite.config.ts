import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  // El código vive en web/ pero .env y .env.example están en la raíz del repo,
  // que es donde el README los documenta. Sin esto Vite los buscaría en web/.
  envDir: '..',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    // Un solo archivo JS: la app es pequeña y el arranque debe ser instantáneo.
    // Partirla en chunks solo agrega round-trips.
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5173,
    // El Worker corre en 8787 (wrangler dev). Proxear /api mantiene el mismo
    // origen en desarrollo, igual que en producción vía VITE_API_BASE.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});
