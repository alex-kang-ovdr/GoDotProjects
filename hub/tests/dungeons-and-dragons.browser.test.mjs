import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const chrome = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const gameUrl = new URL('../../games/dungeons-and-dragons/Web/index.html', import.meta.url);
const playwrightPath = fileURLToPath(new URL('../../forge/node_modules/playwright', import.meta.url));
const require = createRequire(import.meta.url);

test('Dungeons & Dragons keeps moving after reset, class change and loading an existing save',
  { skip: !existsSync(chrome), timeout: 30_000 }, async t => {
    let playwright;
    try { playwright = require.resolve(playwrightPath); }
    catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      t.skip('Playwright is not installed in Forge');
      return;
    }
    const { chromium } = require(playwright);
    const browser = await chromium.launch({ executablePath: chrome, headless: true, timeout: 8_000 });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.setDefaultTimeout(4_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        const original = CanvasRenderingContext2D.prototype.fillRect;
        CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
          // The player body is the only actor drawn at 1.18 times the normal size.
          if (this.canvas.id === 'game' && Math.abs(width - 40 * 1.18) < .01 && Math.abs(height - 54 * 1.18) < .01) {
            window.lastDndPlayer = { x: this.getTransform().e, color: this.fillStyle };
          }
          return original.call(this, x, y, width, height);
        };
      });
      await page.goto(gameUrl.href);
      await page.waitForFunction(() => window.lastDndPlayer?.color === '#6da9e9');

      async function assertCanMove(action, color) {
        try {
          await page.waitForFunction(expected => window.lastDndPlayer?.color === expected, color);
          const start = await page.evaluate(() => window.lastDndPlayer.x);
          await page.keyboard.down('d');
          await page.waitForFunction(initialX => window.lastDndPlayer.x > initialX + 35, start);
          await page.keyboard.up('d');
        } catch (error) {
          assert.deepEqual(errors, [], action);
          throw error;
        }
        assert.deepEqual(errors, [], action);
        t.diagnostic(`${action}: player moved more than 35 px`);
      }

      await page.locator('#new').click();
      await assertCanMove('New game', '#6da9e9');
      await page.locator('#class').selectOption('dwarf');
      await assertCanMove('Change class', '#e4a96a');
      await page.keyboard.press('r');
      await assertCanMove('Restart with R', '#e4a96a');

      await page.evaluate(() => localStorage.setItem('som_v3_save', JSON.stringify({
        type: 'fighter', hp: 123, mp: 20, potions: 2, bombs: 1, ethers: 1,
        score: 0, spell: 0, item: 0, stage: 2, wave: 2, route: ['safe']
      })));
      await page.locator('#load').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('HP 123/210'));
      await assertCanMove('Load existing save', '#6da9e9');
      await page.locator('#save').click();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('som_v3_save')).stage), 2);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
