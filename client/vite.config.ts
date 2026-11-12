import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const cible = `http://127.0.0.1:${process.env['CANAPE_PORT'] ?? '8080'}`;

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    // `partage/` est hors du dossier du client.
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: cible },
      '/media': { target: cible },
      '/ws': { target: cible, ws: true },
    },
  },
});
