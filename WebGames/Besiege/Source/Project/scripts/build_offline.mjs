import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  absWorkingDir: root, entryPoints: ['dist/main.js'], bundle: true, format: 'iife',
  platform: 'browser', target: ['es2022'], minify: true, write: false, legalComments: 'inline',
});
const [source, css, threeLicense, cannonLicense] = await Promise.all(['dist/index.html', 'dist/styles.css', 'dist/vendor/THREE-LICENSE.txt', 'dist/vendor/CANNON-LICENSE.txt'].map(file => readFile(path.join(root, file), 'utf8')));
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const portableScript = `try { ${script}\n } catch (error) { console.error(error); const loader = document.getElementById('loading'); if (loader) { loader.innerHTML = '<strong>게임을 시작하지 못했습니다.</strong><span>최신 WebGL 지원 브라우저에서 열고, 하드웨어 가속 설정을 확인해 주세요.</span>'; loader.hidden = false; loader.classList.remove('done'); } }`;
let html = source
  .replace(/<link rel="stylesheet" href="\.\/styles\.css">/, () => `<style>${css}</style>`)
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => `<script>${portableScript}</script>`)
  .replace('href="./" aria-label="IRONWOOD', 'href="#" aria-label="IRONWOOD')
  .replace(/<a href="\.\/ironwood-source\.zip" download>[\s\S]*?<\/a>/, '');
html = html.replace('<head>', () => `<head>\n<!-- Portable IRONWOOD 4.0.\nTHREE.JS LICENSE\n${threeLicense}\nCANNON-ES LICENSE\n${cannonLicense}\n-->`);
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html)) throw new Error('Portable page still contains a dependent script or stylesheet.');
const output = path.join(root, 'dist', 'ironwood-play.html');
await writeFile(output, html, 'utf8');
console.log(`${output}: ${Buffer.byteLength(html).toLocaleString()} bytes; one HTML file, no external runtime requests`);
