/** Export this project's local modules into one offline HTML. No third-party build dependencies. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, basename } from 'node:path';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const files = ['utilities.js', 'community.js', 'frontier.js', 'engine.js', 'renderer.js', 'app.js'];
const available = new Set();
const chunks = [];

for (const file of files) {
  let source = await readFile(resolve(dist, file), 'utf8');
  // The simulation and renderer are safe to import without a DOM. Reading actual
  // module exports keeps multi-declarator exports and future additions intact.
  const names = file === 'app.js' ? [] : Object.keys(await import(pathToFileURL(resolve(dist, file))));
  source = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"];?\s*$/gm, (_, bindings, dependency) => {
    if (!available.has(dependency)) throw new Error(`${file}: dependency ${dependency} is not bundled yet`);
    const destructuring = bindings.split(',').map(binding => {
      const match = binding.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!match) throw new Error(`${file}: unsupported import ${binding}`);
      return match[2] ? `${match[1]}: ${match[2]}` : match[1];
    }).join(', ');
    return `const { ${destructuring} } = __modules[${JSON.stringify(dependency)}];\n`;
  });
  source = source.replace(/^export\s+(?=(?:const|let|var|function|class)\s)/gm, '');
  if (/^\s*(?:import|export)\s/m.test(source)) throw new Error(`${file}: unsupported module syntax`);
  chunks.push(`__modules[${JSON.stringify(file)}] = (() => {\n${source}\nreturn { ${names.join(', ')} };\n})();`);
  available.add(file);
}

const bundle = `(() => {\n'use strict';\nconst __modules = Object.create(null);\n${chunks.join('\n\n')}\n})();`;
new Script(bundle, { filename: 'breath-colony-standalone.js' });
const [template, css] = await Promise.all([
  readFile(resolve(dist, 'index.html'), 'utf8'),
  readFile(resolve(dist, 'styles.css'), 'utf8'),
]);
const styleTag = '<link rel="stylesheet" href="./styles.css">';
const scriptTag = '<script type="module" src="./app.js"></script>';
if (!template.includes(styleTag) || !template.includes(scriptTag)) throw new Error('Expected HTML entry points changed');
const html = template
  .replace(styleTag, () => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`)
  .replace(scriptTag, () => `<script>\n${bundle.replace(/<\/script/gi, '<\\/script')}\n</script>`);
const output = resolve(dist, 'standalone.html');
await writeFile(output, html);
console.log(`${basename(output)} created: ${Buffer.byteLength(html).toLocaleString('en-US')} bytes; ${files.length} modules, inline CSS and JavaScript.`);
