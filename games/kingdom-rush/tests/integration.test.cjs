const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const r = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(r, p));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const m = JSON.parse(read('game.manifest.json'));
assert.equal(m.id, 'kingdom-rush');
assert.equal(m.version, '18.1.0');
assert.deepEqual(m.supportedLocales, ['ko']);

// Preserve historical v15 archive AND verify incoming v18 archive
assert.equal(
  sha(read('Archive/KingdomRush_Playable_v15_Source.zip')),
  '51e661bd4ddbb047001b7a0a6b729ed28abef607f63041ceedc95c5942ae4e01'
);
assert.equal(
  sha(read('Archive/Incoming/KingdomRush_Playable_v18_Source.zip')),
  '1552068510f4939d5a4fb699b7d3cdf2b373e5934fccc45f484e74f1b1473799'
);
assert.ok(fs.existsSync(path.join(r, 'Archive/Releases/kingdom-rush-v15.1.0.zip')));
assert.ok(fs.existsSync(path.join(r, 'Archive/Releases/kingdom-rush-v15.2.0.zip')));
assert.ok(fs.existsSync(path.join(r, 'Archive/BuildSteps/kingdom-rush-v15.2.0-before-v18.zip')));

const normalize = (s) =>
  s.replace(/\r\n/g, '\n').replace(/\n?<!-- playhub-language:start -->[\s\S]*?<!-- playhub-language:end -->/g, '');
const canonical = normalize(read('Web/index.html').toString('utf8'));
assert.equal(canonical, normalize(read('Source/Project/dist/index.html').toString('utf8')));
assert.ok(fs.existsSync(path.join(r, 'Web', m.media.cover)));
assert.ok(fs.existsSync(path.join(r, 'Web/vendor/playhub-locale.js')));
assert.ok(fs.existsSync(path.join(r, 'Web/vendor/playhub-dictionary.js')));
console.log('Kingdom Rush v18.1.0 canonical + historical archive checks passed');
