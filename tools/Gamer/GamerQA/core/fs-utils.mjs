import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const GAME_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const SEMVER_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.bin': 'application/octet-stream',
});

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Detect duplicate keys in JSON objects at any nesting depth.
 */
function findDuplicateJsonKey(source) {
  let i = 0;
  const len = source.length;
  const skipWs = () => { while (i < len && /\s/.test(source[i])) i++; };
  const readString = () => {
    const start = i;
    i++; // opening quote
    while (i < len) {
      const ch = source[i++];
      if (ch === '\\') {
        if (i < len && source[i] === 'u') i += 5;
        else i++;
      } else if (ch === '"') {
        return JSON.parse(source.slice(start, i));
      }
    }
    throw new Error('Unterminated JSON string');
  };
  const scanValue = () => {
    skipWs();
    if (i >= len) return;
    const ch = source[i];
    if (ch === '"') { readString(); return; }
    if (ch === '{') {
      i++;
      const keys = new Set();
      skipWs();
      if (source[i] === '}') { i++; return; }
      while (i < len) {
        skipWs();
        if (source[i] !== '"') return;
        const key = readString();
        if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key}`);
        keys.add(key);
        skipWs();
        if (source[i] !== ':') return;
        i++;
        scanValue();
        skipWs();
        if (source[i] === ',') { i++; continue; }
        if (source[i] === '}') { i++; return; }
        return;
      }
      return;
    }
    if (ch === '[') {
      i++;
      skipWs();
      if (source[i] === ']') { i++; return; }
      while (i < len) {
        scanValue();
        skipWs();
        if (source[i] === ',') { i++; continue; }
        if (source[i] === ']') { i++; return; }
        return;
      }
      return;
    }
    while (i < len && !/[\s,\}\]]/.test(source[i])) i++;
  };
  scanValue();
}

export function readStrictJson(filePath, maxBytes = 1048576) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) throw new Error(`Symlink forbidden: ${filePath}`);
  if (!stat.isFile()) throw new Error(`Not a regular file: ${filePath}`);
  if (stat.size > maxBytes) throw new Error(`JSON file exceeds limit (${stat.size} > ${maxBytes})`);
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw);
  findDuplicateJsonKey(raw);
  return parsed;
}

/**
 * Strictly resolve a POSIX relative path under baseDir without symlinks or traversal.
 */
export function guardRelativePath(baseDir, relativePath, { allowHidden = false } = {}) {
  if (typeof relativePath !== 'string' || !relativePath) {
    throw new Error(`Empty or non-string relative path: ${String(relativePath)}`);
  }
  if (relativePath !== relativePath.trim()) {
    throw new Error(`Whitespace padded relative path: ${JSON.stringify(relativePath)}`);
  }
  if (
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    relativePath.includes(':') ||
    /[\x00-\x1f\x7f]/.test(relativePath) ||
    /%[0-9a-fA-F]{2}/.test(relativePath)
  ) {
    throw new Error(`Unsafe relative path: ${relativePath}`);
  }
  const parts = relativePath.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || (!allowHidden && part.startsWith('.'))) {
      throw new Error(`Disallowed path segment in: ${relativePath}`);
    }
  }
  if (fs.lstatSync(baseDir).isSymbolicLink()) {
    throw new Error(`Base directory cannot be a symlink: ${baseDir}`);
  }
  let cursor = baseDir;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) {
      throw new Error(`Missing target path: ${relativePath}`);
    }
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Symlink forbidden: ${relativePath}`);
    }
  }
  const rootReal = fs.realpathSync(baseDir);
  const targetReal = fs.realpathSync(cursor);
  if (targetReal !== rootReal && !targetReal.startsWith(rootReal + path.sep)) {
    throw new Error(`Path escapes root directory: ${relativePath}`);
  }
  return targetReal;
}

/**
 * Resolve an HTML reference relative to the HTML file's directory inside webRoot.
 */
export function resolveWebAssetRef(ref, htmlRelPosix, webRoot) {
  if (typeof ref !== 'string' || !ref || ref !== ref.trim() || ref.includes('\\') || /[\x00-\x1f\x7f]/.test(ref)) {
    throw new Error(`Invalid asset reference: ${JSON.stringify(ref)}`);
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref) || ref.startsWith('//') || ref.startsWith('/')) {
    throw new Error(`External or root-absolute asset reference disallowed: ${ref}`);
  }
  const cleanPath = ref.split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(cleanPath);
  } catch {
    throw new Error(`Invalid URI encoding in asset reference: ${ref}`);
  }
  if (!decoded || decoded.includes('\\') || decoded.includes(':') || /[\x00-\x1f\x7f]/.test(decoded)) {
    throw new Error(`Unsafe decoded asset path: ${ref}`);
  }
  const stack = htmlRelPosix.split('/').slice(0, -1);
  for (const seg of decoded.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!stack.length) throw new Error(`Asset reference escapes Web root: ${ref}`);
      stack.pop();
    } else {
      stack.push(seg);
    }
  }
  if (!stack.length) throw new Error(`Asset reference does not name a file: ${ref}`);
  const relPosix = stack.join('/');
  const resolved = guardRelativePath(webRoot, relPosix);
  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`Referenced asset is not a regular file: ${relPosix}`);
  }
  return { relPosix, resolved };
}

export function walkWebTree(webRoot, limits = {}) {
  const maxEntries = limits.maxTreeEntries ?? 2000;
  const maxDepth = limits.maxDepth ?? 32;
  const maxFileBytes = limits.maxFileBytes ?? 100 * 1024 * 1024;
  const maxGameBytes = limits.maxGameBytes ?? 300 * 1024 * 1024;

  const files = [];
  const issues = [];
  let totalBytes = 0;
  let visited = 0;
  const folded = new Map();

  function visit(dir, relPrefix, depth) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      visited++;
      if (visited > maxEntries) {
        issues.push(`File tree entry count exceeds ${maxEntries}`);
        return;
      }
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (Buffer.byteLength(rel, 'utf8') > 240) {
        issues.push(`Relative path exceeds 240 UTF-8 bytes: ${rel}`);
      }
      const norm = rel.normalize('NFC').toLowerCase();
      const prev = folded.get(norm);
      if (prev && prev !== rel) {
        issues.push(`Case/Unicode path collision: ${prev} vs ${rel}`);
      }
      folded.set(norm, rel);

      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        issues.push(`Symlink forbidden: ${rel}`);
        continue;
      }
      if (stat.isDirectory()) {
        if (depth >= maxDepth) {
          issues.push(`Directory depth exceeds ${maxDepth}: ${rel}`);
        } else {
          visit(fullPath, rel, depth + 1);
        }
      } else if (stat.isFile()) {
        totalBytes += stat.size;
        if (stat.size > maxFileBytes) {
          issues.push(`Single file exceeds ${maxFileBytes} bytes: ${rel} (${stat.size})`);
        }
        if (totalBytes > maxGameBytes) {
          issues.push(`Total Web bundle size exceeds ${maxGameBytes} bytes`);
          return;
        }
        files.push({ relPosix: rel, fullPath, size: stat.size, ext: path.extname(entry.name).toLowerCase() });
      } else {
        issues.push(`Special file type forbidden: ${rel}`);
      }
    }
  }

  if (fs.existsSync(webRoot)) {
    if (fs.lstatSync(webRoot).isSymbolicLink()) {
      issues.push('Web directory cannot be a symlink');
    } else {
      visit(webRoot, '', 0);
    }
  } else {
    issues.push('Missing Web directory');
  }

  return { files, issues, totalBytes, visited };
}

export function computeGameTargetHash(gameDir) {
  const hash = crypto.createHash('sha256');
  const manifestPath = path.join(gameDir, 'game.manifest.json');
  if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile()) {
    hash.update('game.manifest.json\0');
    hash.update(fs.readFileSync(manifestPath));
    hash.update('\0');
  }
  const webDir = path.join(gameDir, 'Web');
  if (fs.existsSync(webDir) && fs.statSync(webDir).isDirectory()) {
    const { files } = walkWebTree(webDir, { maxEntries: 5000, maxGameBytes: Number.MAX_SAFE_INTEGER, maxFileBytes: Number.MAX_SAFE_INTEGER });
    for (const f of files) {
      hash.update(`Web/${f.relPosix}\0`);
      hash.update(sha256File(f.fullPath));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

export function checkImageSignature(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('Image file is empty or not a regular file');
  }
  if (ext === '.svg') {
    const text = fs.readFileSync(filePath, 'utf8');
    if (!/<svg[\s>]/i.test(text)) throw new Error('Invalid SVG root element');
    if (/<!\s*(?:DOCTYPE|ENTITY)\b|<\?\s*xml-stylesheet\b|<script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(text)) {
      throw new Error('SVG contains disallowed active/DTD content');
    }
    return 'image/svg+xml';
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(32);
    const bytesRead = fs.readSync(fd, buf, 0, 32, 0);
    if (ext === '.png' && bytesRead >= 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (w > 0 && h > 0) return 'image/png';
    }
    if ((ext === '.jpg' || ext === '.jpeg') && bytesRead >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }
    if (ext === '.gif' && bytesRead >= 10 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('ascii'))) {
      return 'image/gif';
    }
    if (ext === '.webp' && bytesRead >= 16 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    if (ext === '.ico' && bytesRead >= 4 && buf.readUInt16LE(0) === 0 && [1, 2].includes(buf.readUInt16LE(2))) {
      return 'image/x-icon';
    }
  } finally {
    fs.closeSync(fd);
  }
  throw new Error(`Unsupported or mismatched image header for ${path.basename(filePath)}`);
}

/**
 * Parse HTML structure cleanly without matching inside <script> or <style> text bodies.
 */
export function parseHtmlDocument(html) {
  const tags = [];
  const scripts = [];
  const styles = [];
  let cursor = 0;
  const len = html.length;

  const parseAttrs = (raw) => {
    const attrs = {};
    const attrRe = /([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = attrRe.exec(raw)) !== null) {
      const key = m[1].toLowerCase();
      const val = m[2] ?? m[3] ?? m[4] ?? '';
      if (!Object.hasOwn(attrs, key)) attrs[key] = val;
    }
    return attrs;
  };

  while (cursor < len) {
    const lt = html.indexOf('<', cursor);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const endComment = html.indexOf('-->', lt + 4);
      cursor = endComment === -1 ? len : endComment + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const gt = html.indexOf('>', lt + 2);
      cursor = gt === -1 ? len : gt + 1;
      continue;
    }
    const tagMatch = /^<\/?([A-Za-z][A-Za-z0-9:-]*)((?:\s+(?:[^"'<>]|"[^"]*"|'[^']*')*)?)\s*\/?>/.exec(html.slice(lt));
    if (!tagMatch) {
      cursor = lt + 1;
      continue;
    }
    const full = tagMatch[0];
    const isClose = full.startsWith('</');
    const tagName = tagMatch[1].toLowerCase();
    const afterTag = lt + full.length;

    if (!isClose) {
      const attrs = parseAttrs(tagMatch[2] || '');
      tags.push({ tag: tagName, attrs, offset: lt });
      if ((tagName === 'script' || tagName === 'style') && !full.endsWith('/>')) {
        const closeRe = new RegExp(`</${tagName}\\s*>`, 'i');
        const rest = html.slice(afterTag);
        const closeMatch = closeRe.exec(rest);
        const contentEnd = closeMatch ? afterTag + closeMatch.index : len;
        const body = html.slice(afterTag, contentEnd);
        if (tagName === 'script') scripts.push({ attrs, body, offset: lt });
        else styles.push({ attrs, body, offset: lt });
        cursor = closeMatch ? afterTag + closeMatch.index + closeMatch[0].length : len;
        continue;
      }
    }
    cursor = afterTag;
  }

  return { tags, scripts, styles };
}
