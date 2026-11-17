import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../dist/bootstrap.js', import.meta.url), 'utf8');

for (const protocol of ['file:', 'http:', 'https:']) {
  test(`HTML entry loads a runnable script over ${protocol}`, () => {
    assert.match(html, /<script src="\.\/bootstrap\.js\?[^"]+"><\/script>/);
    const scripts = [];
    runInNewContext(bootstrap, {
      location: { protocol },
      document: {
        createElement(tag) {
          assert.equal(tag, 'script');
          return {};
        },
        body: { appendChild(script) { scripts.push(script); } },
      },
    });
    assert.equal(scripts.length, 1);
    const script = scripts[0];
    const source = readFileSync(new URL('../dist/' + script.src.split('?')[0], import.meta.url), 'utf8');
    if (protocol === 'file:') {
      assert.notEqual(script.type, 'module');
      assert.equal(script.src.split('?')[0], './app.bundle.js');
      new Script(source);
    } else {
      assert.equal(script.type, 'module');
      assert.equal(script.src.split('?')[0], './app.js');
    }
  });
}
