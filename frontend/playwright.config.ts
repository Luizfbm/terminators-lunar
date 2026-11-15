import { defineConfig, devices } from '@playwright/test'

// Each checkout can bring up its own mock and app: sessions running the suite side by side
// set these, so one never reuses a mock another started from a different contract.
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT ?? 4010)
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 4173)
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`

// The app is built against the Prism mock of the contract, so e2e never waits on the backend.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  // On the CI runner the globe is drawn by software and the suite runs six times slower than on a
  // laptop, so the first answer can take longer than Playwright's default 5 s to show.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    // The cover of the first visit (the requirement) is out of the way for every test but its own:
    // this is a browser that has seen it. e2e/cover.spec.ts starts from an empty one.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://127.0.0.1:${APP_PORT}`, localStorage: [{ name: 'lunar.cover', value: 'seen' }] }],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'Prism mock',
      command: `npx --yes @stoplight/prism-cli@5.16.0 mock ../contract/openapi.yaml -p ${MOCK_PORT}`,
      url: `${MOCK_URL}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
    },
    {
      name: 'Built app',
      command: `npm run build && npx vite preview --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
      env: { VITE_API_BASE_URL: MOCK_URL },
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
