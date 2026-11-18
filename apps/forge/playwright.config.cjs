const { defineConfig } = require('@playwright/test');
const port = Number(process.env.PLAYFORGE_TEST_PORT || 4173);
module.exports = defineConfig({
  testDir: './Tests/browser',
  timeout: 45000,
  workers: 1,
  retries: 0,
  outputDir: 'Saved/Tests/browser/artifacts',
  reporter: [['list'], ['json', { outputFile: 'Saved/Tests/browser/report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:' + port,
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node Tools/browser-test-server.cjs',
    url: 'http://127.0.0.1:' + port,
    reuseExistingServer: false,
    timeout: 10000,
    env: { PORT: String(port) }
  }
});
