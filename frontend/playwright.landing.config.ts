import { defineConfig } from '@playwright/test'

// Focused component integration only: Vite development server, no build or quality gate.
export default defineConfig({
  testDir: 'e2e',
  testMatch: ['landing-review.spec.ts', 'level3.spec.ts'],
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5186', viewport: { width: 1366, height: 768 } },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: false,
  },
})
