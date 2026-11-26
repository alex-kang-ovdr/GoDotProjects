/** Export this project's local modules into one offline HTML. No third-party build dependencies. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, basename } from 'node:path';
import { Script } from 'node:vm';
import { readNativeGasReference } from './native-gas-reference.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, '../../Web');
const output = resolve(web, 'index.html');
const files = ['elements.js', 'atmosphere.js', 'environment.js', 'rules.js', 'footprint.js', 'utilities.js', 'community.js', 'frontier.js', 'conduits.js', 'gas-network.js', 'pipe-system.js', 'expedition.js', 'research.js', 'engine.js', 'renderer.js', 'research-ui.js', 'gas-comparison.js', 'app.js'];
const available = new Set();
const chunks = [];

for (const file of files) {
  let source = await readFile(resolve(web, file), 'utf8');
  // The simulation and renderer are safe to import without a DOM. Reading actual
  // module exports keeps multi-declarator exports and future additions intact.
  const names = file === 'app.js' ? [] : Object.keys(await import(pathToFileURL(resolve(web, file))));
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
  readFile(output, 'utf8'),
  readFile(resolve(web, 'styles.css'), 'utf8'),
]);
const styleTag = template.match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/i)?.[0];
const scriptTags = template.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];
const scriptTag = scriptTags.find(tag => !/\bsrc\s*=/i.test(tag.slice(0, tag.indexOf('>'))));
if (!styleTag || !scriptTag || scriptTags.filter(tag => !/\bsrc\s*=/i.test(tag.slice(0, tag.indexOf('>')))).length !== 1) {
  throw new Error('Expected one inline style and one inline application script in Web/index.html');
}
const reference=await readNativeGasReference();
const html = template
  .replace(/<template id="gas-measurements">[\s\S]*?<\/template>/,()=>'<template id="gas-measurements">'+JSON.stringify(reference).replace(/</g,'\\u003c')+'</template>')
  .replace(styleTag, () => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`)
  .replace(scriptTag, () => `<script>\n${bundle.replace(/<\/script/gi, '<\\/script')}\n</script>`);
const outputScriptTags = html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];
const outputScript = outputScriptTags.find(tag => !/\bsrc\s*=/i.test(tag.slice(0, tag.indexOf('>'))));
if (!outputScript || outputScriptTags.filter(tag => !/\bsrc\s*=/i.test(tag.slice(0, tag.indexOf('>')))).length !== 1) {
  throw new Error('Expected one generated inline application script in Web/index.html');
}
new Script(outputScript.slice(outputScript.indexOf('>') + 1, outputScript.toLowerCase().lastIndexOf('</script')), { filename: 'Web/index.html inline application script' });
await writeFile(output, html);
console.log(`${basename(output)} regenerated: ${Buffer.byteLength(html).toLocaleString('en-US')} bytes; ${files.length} modules, inline CSS and JavaScript.`);
