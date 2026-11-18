#!/usr/bin/env node
/* Generate a self-contained playable HTML from the same production sources. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'exports', 'starforge.html'));
let html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
html = html.replace(/<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?\s*>/, () => '<style>\n' + fs.readFileSync(path.join(root, 'dist', 'style.css'), 'utf8') + '\n</style>');
for (const name of ['data.js', 'sim.js', 'editor.js', 'render.js', 'app.js']) {
  const escaped = name.replace('.', '\\.');
  const pattern = new RegExp('<script\\s+src="' + escaped + '"></script>');
  if (!pattern.test(html)) throw new Error('Missing source reference: ' + name);
  const code = fs.readFileSync(path.join(root, 'dist', name), 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(pattern, () => '<script>\n' + code + '\n</script>');
}
if (/src="(?:data|sim|editor|render|app)\.js"|href="style\.css"/.test(html)) throw new Error('An external game asset remains.');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log(output);
