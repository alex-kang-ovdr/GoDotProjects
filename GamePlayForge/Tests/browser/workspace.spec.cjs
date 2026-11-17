const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const testBaseURL = `http://127.0.0.1:${process.env.PLAYFORGE_TEST_PORT || 4173}`;
const catalog = require('../../projects.json').projects;
const studioPath = process.env.PLAYFORGE_FRONTEND === 'godot' ? '/StudioGodot/' : '/Studio/';
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
async function openStudio(page, frontend = studioPath) {
  await page.goto(`${frontend}?lang=en`);
  await page.waitForFunction(() => window.GamePlayForgeStudio?.state.project && window.GamePlayForgeStudio.state.revision !== null);
  await expect(page.locator('#assetGrid img')).toHaveCount(3);
}
const runtime = page => page.evaluate(() => window.GamePlayForgeStudio.state.runtimeState);

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

test('Studio offers eight locales and real asset thumbnails with keyboard preview', async ({ page }, info) => {
  await openStudio(page);
  await expect(page.locator('#languageSelect option')).toHaveCount(8);
  for (const locale of ['ko', 'en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi']) {
    await page.locator('#languageSelect').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const untranslated = await page.evaluate(() => [...document.querySelectorAll('[data-i18n]')]
      .filter(node => node.textContent !== GamePlayForgeI18n.t(node.dataset.i18n))
      .map(node => ({ id: node.id, key: node.dataset.i18n, text: node.textContent, expected: GamePlayForgeI18n.t(node.dataset.i18n) })));
    expect(untranslated, `Untranslated labels for ${locale}`).toEqual([]);
  }
  await page.locator('#languageSelect').selectOption('ko');
  for (const thumbnail of await page.locator('#assetGrid button').all()) {
    await expect(thumbnail.locator('img')).toBeVisible();
    expect(await thumbnail.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await thumbnail.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#assetModal')).toBeVisible();
    await expect.poll(() => page.locator('#assetImage').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#assetModal')).toBeHidden(); await expect(thumbnail).toBeFocused();
  }
  await page.screenshot({ path: info.outputPath('studio-desktop.png'), fullPage: true });
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'en'); // Explicit URL has priority.
  await page.goto(studioPath); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('studio-mobile.png'), fullPage: true });
});

test('classic and Godot editor layouts share the same GDScript document', async ({ page, browser }) => {
  const otherContext = await browser.newContext({ baseURL: testBaseURL, viewport: { width: 1440, height: 960 } });
  const godotStudio = await otherContext.newPage();
  try {
    await page.addInitScript(() => localStorage.setItem('gameplayforge.name', 'Classic editor'));
    await godotStudio.addInitScript(() => localStorage.setItem('gameplayforge.name', 'Godot editor'));
    await openStudio(page, '/Studio/');
    await openStudio(godotStudio, '/StudioGodot/');
    await expect(page.locator('#presenceList')).toContainText('Godot editor');
    await expect(godotStudio.locator('#presenceList')).toContainText('Classic editor');
    await page.locator('[data-tab="lua"]').click();
    await godotStudio.locator('[data-tab="lua"]').click();
    await page.locator('#sourceEditor').press('Control+End');
    await page.keyboard.insertText('\n# Cross frontend shared source proof');
    await expect(godotStudio.locator('#sourceEditor')).toHaveValue(new RegExp('Cross frontend shared source proof'));
    await godotStudio.locator('#sourceEditor').press('Control+End');
    await godotStudio.keyboard.insertText('\n# Godot layout shared source proof');
    await expect(page.locator('#sourceEditor')).toHaveValue(/Godot layout shared source proof/);
  } finally {
    await otherContext.close();
  }
});

test('native Godot GDScript PIE starts, pauses, survives language changes and really stops', async ({ page }, info) => {
  await openStudio(page);
  await page.locator('#playButton').click();
  await expect.poll(async () => (await runtime(page))?.state).toBe('ready');
  expect(await page.evaluate(() => GamePlayForgeStudio.state.runtimeName)).toMatch(/Godot.*GDScript/i);
  await page.locator('#gameCanvas').click();
  await expect.poll(async () => (await runtime(page))?.state).toBe('playing');
  await page.locator('#pauseButton').click();
  await expect.poll(async () => (await runtime(page))?.state).toBe('paused');
  await expect(page.locator('#pauseButton')).toHaveText(/Resume|Continue/i);
  const before = await runtime(page);
  await page.locator('#languageSelect').selectOption('ja');
  await page.waitForTimeout(250); // Observe a real paused simulation interval.
  const after = await runtime(page);
  expect(after.bird).toEqual(before.bird); expect(after.score).toBe(before.score);
  await page.locator('#restartButton').click();
  await expect.poll(async () => (await runtime(page))?.state).toBe('ready');
  await page.locator('#gameCanvas').focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await runtime(page))?.state).toBe('playing');
  await page.keyboard.press('p');
  await expect.poll(async () => (await runtime(page))?.state).toBe('paused');
  await page.screenshot({ path: info.outputPath('godot-pie.png'), fullPage: true });
  await page.locator('#stopButton').click();
  await expect.poll(() => runtime(page)).toBeNull();
  expect(await page.locator('iframe').count()).toBe(0);
});

test('editing GDScript changes the actual engine result, and syntax errors recover', async ({ page }) => {
  await openStudio(page);
  await page.locator('[data-tab="lua"]').click();
  const original = await page.locator('#sourceEditor').inputValue();
  const proof = original.replace('"state": _state,', '"editorProof": 731,\n\t\t"state": _state,');
  expect(proof).not.toBe(original);
  try {
    await page.locator('#sourceEditor').fill(proof);
    await page.locator('#saveSource').click();
    await page.locator('#playButton').click();
    await expect.poll(async () => (await runtime(page))?.editorProof).toBe(731);
    await page.locator('#stopButton').click();
    await page.locator('[data-tab="lua"]').click();
    await page.locator('#sourceEditor').fill('this is not valid GDScript');
    await page.locator('#saveSource').click();
    await page.locator('#playButton').click();
    const runtimeFailure = await page.evaluate(() => GamePlayForgeI18n.t('runtimeFailed'));
    await expect(page.locator('#logList')).toContainText(runtimeFailure);
    expect(await runtime(page)).toBeNull();
  } finally {
    await page.locator('[data-tab="lua"]').click();
    await page.locator('#sourceEditor').fill(original);
    await page.locator('#saveSource').click();
  }
  await page.locator('#playButton').click();
  await expect.poll(async () => (await runtime(page))?.state).toBe('ready');
  await page.locator('#stopButton').click();
});

test('two users share cursors, merge GDScript edits, preserve remote undo and enforce settings locks', async ({ page, browser }, info) => {
  await page.addInitScript(() => localStorage.setItem('gameplayforge.name', 'Alice'));
  await openStudio(page);
  const otherContext = await browser.newContext({ baseURL: testBaseURL, viewport: { width: 1440, height: 960 } });
  const bob = await otherContext.newPage();
  const bobErrors = []; bob.on('pageerror', e => bobErrors.push(e.message));
  await bob.addInitScript(() => localStorage.setItem('gameplayforge.name', 'Bob'));
  try {
    await openStudio(bob);
    await expect(page.locator('#presenceList')).toContainText('Bob');
    await expect(bob.locator('#presenceList')).toContainText('Alice');
    await page.locator('[data-tab="lua"]').click(); await bob.locator('[data-tab="lua"]').click();
    const original = await page.locator('#sourceEditor').inputValue();
    const box = await bob.locator('#sourceEditor').boundingBox();
    await bob.mouse.move(box.x + box.width * .4, box.y + box.height * .3);
    await bob.locator('#sourceEditor').focus();
    await expect.poll(() => page.evaluate(() => GamePlayForgeStudio.state.users.some(u => u.name === 'Bob' && u.cursor?.pane === 'lua'))).toBe(true);
    await Promise.all([
      page.locator('#sourceEditor').press('Control+End').then(() => page.keyboard.insertText('\n# Alice concurrent edit')),
      bob.locator('#sourceEditor').press('Control+End').then(() => bob.keyboard.insertText('\n# Bob concurrent edit'))
    ]);
    for (const client of [page, bob]) {
      await expect(client.locator('#sourceEditor')).toHaveValue(/Alice concurrent edit/);
      await expect(client.locator('#sourceEditor')).toHaveValue(/Bob concurrent edit/);
    }
    await page.locator('#undoButton').click();
    await expect(page.locator('#sourceEditor')).not.toHaveValue(/Alice concurrent edit/);
    await expect(page.locator('#sourceEditor')).toHaveValue(/Bob concurrent edit/);
    await page.locator('#acquireSettingsLock').click();
    await expect(page.locator('#gravity')).toBeEnabled();
    await expect(bob.locator('#gravity')).toBeDisabled();
    await page.locator('#gravity').fill('777');
    await page.locator('#saveSource').click();
    await expect(bob.locator('#gravity')).toHaveValue('777');
    await page.screenshot({ path: info.outputPath('two-user-collaboration.png'), fullPage: true });
    await expect(page.locator('#acquireSettingsLock')).toBeEnabled();
    await page.locator('#acquireSettingsLock').click();
    await expect(page.locator('#gravity')).toBeEnabled();
    await page.locator('#gravity').fill('1050'); await page.locator('#saveSource').click();
    await page.locator('#sourceEditor').fill(original); await page.locator('#saveSource').click();
    expect(bobErrors).toEqual([]);
  } finally { await otherContext.close(); }
  await expect(page.locator('#presenceList')).not.toContainText('Bob');
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
