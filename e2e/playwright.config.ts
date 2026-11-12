import { defineConfig, devices } from '@playwright/test';

/**
 * Essais de bout en bout de Canapé.
 *
 * Le serveur Canapé n'est pas lancé par `webServer` : chaque fichier d'essais (chaque worker) démarre le sien
 * (`bin/canape serve`, port libre, dossiers temporaires) grâce aux fixtures de `support/fixtures.ts`, pour que
 * les parcours ne partagent aucun état. `global-setup.ts` construit le client s'il manque et fabrique les films d'essai.
 *
 * Sur ce poste : jamais hors de la file Gagarine, par exemple
 *   gagarine file "e2e" 4 4 -- npm run e2e -- --project=chromium
 */
const CI = Boolean(process.env['CI']);

const chromiumArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  // Deux pages sur la même machine : des candidats `host` ordinaires, pas de noms .local (mDNS) à résoudre.
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];

// Firefox : pas de `permissions` du contexte (inconnues), ce sont les préférences qui accordent la caméra simulée.
const firefoxPrefs = {
  'media.navigator.streams.fake': true,
  'media.navigator.permission.disabled': true,
  'media.autoplay.default': 0,
  'media.autoplay.blocking_policy': 0,
  // Pas de mDNS pour les candidats locaux : la connexion se fait sans STUN.
  'media.peerconnection.ice.obfuscate_host_addresses': false,
};

const WEBKIT = process.env['CANAPE_E2E_WEBKIT'] !== '0';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // Le projet « téléphone » ne rejoue que ses propres parcours (et les captures) ; les autres ne les rejouent pas.
  testIgnore: ['**/telephone.spec.ts'],
  globalSetup: './global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : 2,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : [['list']],
  outputDir: '../test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    testIdAttribute: 'data-test',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], permissions: ['camera', 'microphone'], launchOptions: { args: chromiumArgs } },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: firefoxPrefs } },
    },
    {
      // Google Chrome (installé sur le poste ; `npx playwright install chrome` en CI) : décode le H.264, donc la lecture convertie.
      name: 'chrome',
      testMatch: '**/lecture.spec.ts',
      testIgnore: [],
      use: { ...devices['Desktop Chrome'], channel: 'chrome', permissions: ['camera', 'microphone'], launchOptions: { args: chromiumArgs } },
    },
    ...(WEBKIT
      ? [{
          // Pas de caméra simulée sous WebKit : la salle doit marcher sans média local.
          name: 'webkit',
          use: { ...devices['Desktop Safari'] },
        }]
      : []),
    {
      name: 'telephone',
      testIgnore: [],
      testMatch: ['**/telephone.spec.ts', '**/captures.spec.ts'],
      use: { ...devices['Pixel 7'], permissions: ['camera', 'microphone'], launchOptions: { args: chromiumArgs } },
    },
  ],
});
