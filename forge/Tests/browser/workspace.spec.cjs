const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../../projects.json').projects;
const entry = title => catalog.find(p => p.entrypoint.includes(title)).entrypoint;
const availableCatalog = catalog.filter(project => project.available !== false && fs.existsSync(path.resolve(__dirname, '..', '..', project.entrypoint.split('?')[0])));
const available = title => {
  const item = catalog.find(project => project.entrypoint.includes(title));
  return !!item && fs.existsSync(path.resolve(__dirname, '..', '..', item.entrypoint.split('?')[0]));
};

test.beforeEach(async ({ page, context }) => {
  page.runtimeErrors = []; page.runtimeWarnings = [];
  page.on('pageerror', error => page.runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning') page.runtimeWarnings.push(message.text());
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) page.runtimeErrors.push(message.text());
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    page.runtimeErrors.push('Unexpected external request: ' + url.origin); return route.abort();
  });
});
test.afterEach(async ({ page }, info) => {
  await info.attach('runtime-diagnostics', { body: JSON.stringify({ errors: page.runtimeErrors, warnings: page.runtimeWarnings }, null, 2), contentType: 'application/json' });
  expect(page.runtimeErrors).toEqual([]);
});
test('hub distinguishes GDScript runtime from available PoC references on desktop and mobile', async ({ page }, info) => {
  await page.goto('/');
  for (const project of availableCatalog) await expect(page.locator(`a[href="${project.entrypoint}"]`).first()).toBeVisible();
  for (const project of catalog.filter(item => item.available === false)) {
    const card = page.locator(`[data-project-id="${project.id}"]`);
    await expect(card.locator('.card-link')).toHaveAttribute('aria-disabled', 'true');
    await expect(card.locator('a.card-link')).toHaveCount(0);
    await expect(card.locator('.availability')).toHaveText(project.availabilityReason || /원본 파일 누락/);
  }
  await page.screenshot({ path: info.outputPath('hub-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const project of availableCatalog) await expect(page.locator(`a[href="${project.entrypoint}"]`).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('hub-mobile.png'), fullPage: true });
});

test('Nexus Front reference starts and pauses with its selected settings', async ({ page }, info) => {
  test.skip(!available('League of Legends'), 'Imported Nexus Front source is missing from this checkout');
  await page.goto('/' + entry('League of Legends'));
  await expect(page.locator('#hero-cards button')).toHaveCount(3);
  await page.locator('[data-map-scale="1.5"]').click(); await page.locator('#lobby-speed-choice').selectOption('0.5');
  await page.locator('#start-button').click(); await expect(page.locator('#lobby')).toBeHidden();
  expect(await page.evaluate(() => NexusFront.settings())).toEqual({ mapScale: 1.5, speed: .5 });
  await page.locator('#pause-button').click(); await expect(page.locator('#pause-modal')).toBeVisible();
  await page.locator('#resume-button').click(); await expect(page.locator('#pause-modal')).toBeHidden();
  await page.screenshot({ path: info.outputPath('nexus-reference.png'), fullPage: true });
});

test('RTK11 reference preserves state across 2D/3D and advances a turn', async ({ page }, info) => {
  test.skip(!available('삼국지 11'), 'Imported RTK11 source is missing from this checkout');
  await page.goto('/' + entry('삼국지 11')); await page.waitForFunction(() => !!window.RTK_APP);
  await page.locator('#start-mode-2d').click(); await page.locator('#start-game').click();
  await expect(page.locator('#start-screen')).toBeHidden();
  const previous = await page.evaluate(() => RTK_APP.engine.serialize());
  await page.locator('#mode-3d').click();
  await expect.poll(() => page.evaluate(() => RTK_APP.renderer.viewMode)).toBe('3d');
  expect(await page.evaluate(() => RTK_APP.engine.serialize())).toEqual(previous);
  await page.locator('#mode-2d').click(); const turn = await page.evaluate(() => RTK_APP.engine.s.turn);
  await page.locator('#end-turn').click();
  await expect.poll(() => page.evaluate(() => RTK_APP.engine.s.turn)).toBe(turn + 1);
  await page.screenshot({ path: info.outputPath('rtk-reference.png'), fullPage: true });
});
