#!/usr/bin/env node

// No npm packages are required. All paths are relative to this script's project.
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(projectRoot, 'dist');
const output = join(dist, 'breach-command-offline.html');
const scriptNames = ['campaign.js', 'engine.js', 'art.js', 'app.js'];
const args = process.argv.slice(2);

if (args.some(arg => arg !== '--check')) {
  console.error('사용법: node scripts/build-offline.mjs [--check]');
  console.error('--check: 메모리에서 번들을 검증하고 파일은 생성하지 않습니다.');
  process.exitCode = 1;
} else {
  try {
    await build(args.includes('--check'));
  } catch (error) {
    console.error('오프라인 빌드 실패: ' + error.message);
    process.exitCode = 1;
  }
}

function attribute(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\x27])([^"\x27]*)\\1', 'i'));
  return match ? match[2] : null;
}

function localName(url) {
  return url === null ? null : url.replace(/^\.\//, '');
}

function escapeClosingTag(source, tag) {
  // HTML parses closing raw-text tags even inside JavaScript/CSS strings.
  // Keep the JavaScript/CSS value intact while preventing premature HTML closure.
  return source.replace(new RegExp('</' + tag, 'gi'), match => '<\\/' + match.slice(2));
}

async function build(checkOnly) {
  const names = ['index.html', 'style.css', ...scriptNames];
  const contents = await Promise.all(names.map(name => readFile(join(dist, name), 'utf8')));
  const files = Object.fromEntries(names.map((name, index) => [name, contents[index]]));
  let html = files['index.html'];
  let styleCount = 0;
  const foundScripts = new Set();

  html = html.replace(/<link\b[^>]*>/gi, tag => {
    if ((attribute(tag, 'rel') || '').toLowerCase() !== 'stylesheet') return tag;
    if (localName(attribute(tag, 'href')) !== 'style.css') {
      throw new Error('알 수 없는 스타일시트 참조: ' + tag);
    }
    styleCount += 1;
    const offlineStyle = '\n/* The downloadable edition already is the complete file. */\n' +
      'a[download][href$="breach-command-offline.html"], a[download][href$="breach-command-source.zip"] { display: none !important; }\n';
    return '<style data-offline-source="style.css">\n' + escapeClosingTag(files['style.css'] + offlineStyle, 'style') + '\n</style>';
  });

  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, tag => {
    const source = localName(attribute(tag.slice(0, tag.indexOf('>') + 1), 'src'));
    if (!scriptNames.includes(source)) {
      throw new Error('예상하지 못한 스크립트 태그입니다: ' + (source || 'inline script'));
    }
    if (foundScripts.has(source)) throw new Error('스크립트가 중복되었습니다: ' + source);
    foundScripts.add(source);
    return '';
  });

  if (styleCount !== 1) throw new Error('style.css 참조가 정확히 하나 있어야 합니다.');
  if (foundScripts.size !== scriptNames.length) {
    throw new Error('필요한 스크립트가 누락되었습니다: ' + scriptNames.filter(name => !foundScripts.has(name)).join(', '));
  }
  if (!/<\/body\s*>/i.test(html)) throw new Error('index.html에 닫는 body 태그가 없습니다.');

  html = html.replace(/^[ \t]+$/gm, '');

  // Body insertion is intentional: app.js reads DOM elements immediately.
  const inlineScripts = scriptNames.map(name =>
    '<script data-offline-source="' + name + '">\n' + escapeClosingTag(files[name], 'script') + '\n</script>'
  ).join('\n');
  html = html.replace(/<\/body\s*>/i, () => '\n' + inlineScripts + '\n</body>');

  const externalScripts = html.match(/<script\b[^>]*\bsrc\s*=/gi);
  const inlineCount = (html.match(/<script data-offline-source=/g) || []).length;
  if (externalScripts || inlineCount !== scriptNames.length) throw new Error('단일 파일의 스크립트 의존성 검증에 실패했습니다.');

  const bytes = Buffer.byteLength(html, 'utf8');
  if (checkOnly) {
    console.log('오프라인 번들 검증 통과: ' + bytes.toLocaleString('en-US') + ' bytes · 파일 미생성');
    return;
  }

  // Atomic replacement avoids leaving a truncated downloadable file on failure.
  const temporary = output + '.tmp-' + process.pid;
  try {
    await writeFile(temporary, html, 'utf8');
    await rename(temporary, output);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  console.log('오프라인 HTML 생성: ' + output + ' (' + bytes.toLocaleString('en-US') + ' bytes)');
}
