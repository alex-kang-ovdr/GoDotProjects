import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const names = ['maps', 'geometry', 'engine', 'renderer', 'audio', 'career', 'app'];
const modules = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(new URL(`js/${name}.js`, dist), 'utf8')])));
const exported = source => [...source.matchAll(/^export\s+(?:const|let|function|class)\s+(\w+)/gm)].map(match => match[1]);
function wrap(name) {
  const original = modules[name];
  let source = original.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\/(\w+)\.js['"];?$/gm, (_, values, dependency) => `const {${values}} = __${dependency};`);
  const reexports = [...source.matchAll(/^export\s+\{([^}]+)\}\s+from\s+['"]\.\/(\w+)\.js['"];?$/gm)].flatMap(match => match[1].split(',').map(value => value.trim()));
  source = source.replace(/^export\s+\{[^}]+\}\s+from\s+[^\n]+\n?/gm, '').replace(/^export\s+(?=const|let|function|class)/gm, '');
  return `const __${name} = (() => {\n${source}\nreturn {${[...new Set([...exported(original), ...reexports])].join(',')}};\n})();`;
}
const script = `'use strict';\n(() => {\n${names.map(wrap).join('\n\n')}\n})();`;
new vm.Script(script, { filename: 'iron-front-offline.js' });
let [html, css, icon, v2css, v3css] = await Promise.all(['index.html', 'styles.css', 'icon.svg', 'v2.css', 'v3.css'].map(file => readFile(new URL(file, dist), 'utf8')));
html = html.replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${css}\n${v2css}\n${v3css}\n</style>`)
  .replace(/^\s*<link rel="stylesheet" href="\.\/v[23]\.css">\n/gm, '')
  .replace('href="./icon.svg"', `href="data:image/svg+xml,${encodeURIComponent(icon)}"`)
  .replace('href="./" aria-label="철의 전선 홈"', 'href="#" aria-label="철의 전선 홈"')
  .replace(/<a id="offline-link"[^>]*>[^<]*<\/a>/, '<span>OFFLINE EDITION</span>')
  .replace('<script type="module" src="./js/app.js"></script>', `<script>\n${script.replace(/<\/script/gi, '<\\/script')}\n</script>`);
const output = new URL('iron-front-offline.html', dist);
await writeFile(output, html, 'utf8');
console.log(`Offline game generated: ${fileURLToPath(output)} (${Buffer.byteLength(html)} bytes)`);
