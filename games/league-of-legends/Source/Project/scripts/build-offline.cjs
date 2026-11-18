'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dist, 'style.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`);
for (const name of ['navigation.js', 'restored-data.js', 'restored-gameplay.js', 'vision.js', 'tactical-ai.js', 'game.js', 'renderer.js', 'history.js', 'checkpoint.js', 'coach.js', 'controls.js', 'catalog.js', 'app.js']) {
  const js = fs.readFileSync(path.join(dist, name), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(`Unsafe inline script terminator in ${name}`);
  html = html.replace(`<script src="${name}"></script>`, () => `<script>\n${js}\n</script>`);
}
// Embed only the locally pinned portraits used by the six playable champions
// and supported shop. The full catalogue has no runtime CDN dependency.
const assetPaths = [...new Set(html.match(/assets\/(?:champions|items)\/[A-Za-z0-9_-]+\.png/g) || [])];
for (const asset of assetPaths) {
  const content = fs.readFileSync(path.join(dist, asset));
  html = html.replaceAll(asset, `data:image/png;base64,${content.toString('base64')}`);
}
if (/<script\b[^>]*\bsrc=|<link\b[^>]*\bhref="style.css"/.test(html)) throw new Error('Offline document still references a separate script or stylesheet');
// The downloaded file already contains everything. Its download links can save
// the same document again without requiring a separate asset beside it.
html = html.replaceAll('href="nexus-front-offline.html"', 'href="#" data-offline-copy');
html = html.replace('</body>', `<script>
(() => {
  const original = '<!doctype html>\\n' + document.documentElement.outerHTML;
  document.querySelectorAll('[data-offline-copy]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const url = URL.createObjectURL(new Blob([original], {type:'text/html;charset=utf-8'}));
    const download = document.createElement('a');
    download.href = url; download.download = 'nexus-front.html'; download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
})();
</script>\n</body>`);
const output = path.join(dist, 'nexus-front-offline.html');
fs.writeFileSync(output, html);
console.log(`Generated ${path.relative(root, output)} (${Buffer.byteLength(html).toLocaleString()} bytes; ${assetPaths.length} portraits embedded).`);
