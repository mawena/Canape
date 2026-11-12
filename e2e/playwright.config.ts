import { defineConfig } from '@playwright/test';

// Squelette : l'agent d'intégration complète (serveur de test, projets Chromium/Firefox/WebKit, caméras simulées).
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  use: { baseURL: process.env['CANAPE_E2E_URL'] ?? 'http://localhost:8080' },
});
