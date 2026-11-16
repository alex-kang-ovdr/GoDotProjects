#!/usr/bin/env node
'use strict';

// Turn the buildless, classic-script browser entry into one downloadable file.
// No network, package manager, minifier, or third-party runtime is needed.
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const input = path.resolve(process.argv[2] || path.join(projectRoot, 'dist', 'index.html'));
const output = path.resolve(process.argv[3] || path.join(projectRoot, 'artifacts', 'STARWARD_Offline.html'));
const assetRoot = path.dirname(input);
let html = fs.readFileSync(input, 'utf8');
let cssCount = 0;
let scriptCount = 0;
const sources = [];

function attr(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

function localAsset(reference) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) {
    throw new Error('Offline build requires a local asset: ' + reference);
  }
  const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
  const resolved = path.resolve(assetRoot, pathname.replace(/^\/+/, ''));
  if (resolved !== assetRoot && !resolved.startsWith(assetRoot + path.sep)) {
    throw new Error('Asset points outside the entry directory: ' + reference);
  }
  sources.push(path.relative(projectRoot, resolved));
  return fs.readFileSync(resolved, 'utf8');
}

html = html.replace(/<link\b[^>]*>/gi, tag => {
  if ((attr(tag, 'rel') || '').toLowerCase() !== 'stylesheet') return tag;
  const href = attr(tag, 'href');
  if (!href) throw new Error('Stylesheet without href');
  const css = localAsset(href).replace(/<\/style/gi, '<\\/style');
  cssCount += 1;
  const media = attr(tag, 'media');
  return '<style' + (media ? ' media="' + media.replace(/"/g, '&quot;') + '"' : '') + '>\n' + css + '\n</style>';
});

html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attributes, inline) => {
  const tag = '<script ' + attributes + '>';
  const src = attr(tag, 'src');
  if (!src) return whole;
  if ((attr(tag, 'type') || '').toLowerCase() === 'module') {
    throw new Error('This offline builder expects classic scripts, not modules.');
  }
  if (inline.trim()) throw new Error('External script also has an inline body: ' + src);
  const source = localAsset(src).replace(/<\/script/gi, '<\\/script');
  scriptCount += 1;
  return '<script>\n/* Inline asset: ' + src.replace(/\*\//g, '') + ' */\n' + source + '\n</script>';
});

if (scriptCount < 4 || cssCount < 1) {
  throw new Error('Incomplete game entry: expected at least four local scripts and one stylesheet.');
}
if (/<script\b[^>]*\bsrc\s*=/i.test(html) || /<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(html)) {
  throw new Error('Unresolved external code reference in offline output.');
}

html = html.replace(/<!doctype html>/i, '<!doctype html>\n<!-- STARWARD standalone edition. Generated from the local browser sources. -->');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
const webCopy = path.join(assetRoot, 'STARWARD_Offline.html');
if (path.resolve(webCopy) !== output) fs.copyFileSync(output, webCopy);
console.log(JSON.stringify({ output, webCopy, bytes: Buffer.byteLength(html), stylesheets: cssCount, scripts: scriptCount, sources }, null, 2));
