#!/usr/bin/env node
/**
 * FTL: Faster Than Light — Godot 4.7.2 Web (WASM) Exporter & FTL PKG Asset Streaming Server
 *
 * Exports forge/Templates/ftl to Godot 4.7.2 Web (HTML5/WASM) and serves it alongside
 * a zero-copy HTTP bridge (/ftl-pkg/xml-bundle.json & /ftl-pkg/raw/*) reading directly
 * from C:\Temp\FTL\ftl.dat.vanilla (3,219 entries, 0 MB duplicated on disk).
 *
 * Usage:
 *   node forge/Templates/ftl/tools/serve-ftl-web.mjs --export --port 4180
 *   node forge/Templates/ftl/tools/serve-ftl-web.mjs --export-only
 *   node forge/Templates/ftl/tools/serve-ftl-web.mjs --port 4180
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');
const forgeRoot = path.resolve(projectDir, '..', '..');
const defaultOutDir = path.join(projectDir, 'Saved', 'web');

const WEB_EXPORT_PRESET = `[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json,*.txt,*.cfg"
exclude_filter="addons/*,.playforge_backups/*,tests/*,saved/*,tools/*"
export_path=""
script_export_mode=0
[preset.0.options]
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
progressive_web_app/enabled=false
`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.pck', '.txt']);

export class FtlPkgReader {
  constructor(filePath) {
    this.filePath = filePath;
    this.fd = null;
    this.entries = new Map();
    this.xmlBundleGzip = null;
    this.xmlBundleRaw = null;
    if (filePath && fs.existsSync(filePath)) {
      this._open(filePath);
    }
  }

  _open(filePath) {
    const fd = fs.openSync(filePath, 'r');
    const hdr = Buffer.alloc(16);
    fs.readSync(fd, hdr, 0, 16, 0);
    if (hdr.subarray(0, 4).toString('ascii') !== 'PKG\n') {
      fs.closeSync(fd);
      throw new Error(`Not a valid FTL 1.6 PKG\\n archive: ${filePath}`);
    }
    const hdrSize = hdr.readUInt16BE(4);
    const entrySize = hdr.readUInt16BE(6);
    const entryCount = hdr.readUInt32BE(8);
    const nameSize = hdr.readUInt32BE(12);

    const table = Buffer.alloc(entryCount * entrySize);
    fs.readSync(fd, table, 0, table.length, hdrSize);
    const names = Buffer.alloc(nameSize);
    fs.readSync(fd, names, 0, names.length, hdrSize + table.length);

    for (let i = 0; i < entryCount; i++) {
      const base = i * entrySize;
      const nameOffRaw = table.readUInt32BE(base + 4);
      const dataOff = table.readUInt32BE(base + 8);
      const dataSize = table.readUInt32BE(base + 12);
      const nameOff = nameOffRaw & 0x00ffffff;
      if (nameOff >= nameSize) continue;
      let end = nameOff;
      while (end < nameSize && names[end] !== 0) end++;
      const name = names.subarray(nameOff, end).toString('utf8');
      this.entries.set(name, { offset: dataOff, size: dataSize });
    }
    this.fd = fd;
  }

  get loaded() {
    return this.fd !== null && this.entries.size > 0;
  }

  readEntry(relPath) {
    const info = this.entries.get(relPath);
    if (!info || this.fd === null) return null;
    const buf = Buffer.alloc(info.size);
    fs.readSync(this.fd, buf, 0, info.size, info.offset);
    return buf;
  }

  getXmlBundle() {
    if (!this.loaded) return null;
    if (!this.xmlBundleRaw) {
      const files = {};
      const index = [];
      for (const relPath of this.entries.keys()) {
        index.push(relPath);
        if (
          relPath.startsWith('data/') &&
          (relPath.endsWith('.xml') || relPath.endsWith('.txt')) &&
          !relPath.startsWith('data/text-') // skip non-English translation packs to keep bundle compact
        ) {
          const buf = this.readEntry(relPath);
          if (buf) files[relPath] = buf.toString('utf8').replace(/^\uFEFF/, '');
        }
      }
      const payload = JSON.stringify({
        archive: path.basename(this.filePath),
        entry_count: this.entries.size,
        files,
        index,
      });
      this.xmlBundleRaw = Buffer.from(payload, 'utf8');
      this.xmlBundleGzip = zlib.gzipSync(this.xmlBundleRaw, { level: 6 });
    }
    return { raw: this.xmlBundleRaw, gzip: this.xmlBundleGzip };
  }

  close() {
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch {}
      this.fd = null;
    }
  }
}

export function findFtlArchive(explicitPath = '') {
  const candidates = [
    explicitPath,
    process.env.FTL_DAT_PATH || '',
    'C:\\Temp\\FTL\\ftl.dat.vanilla',
    'C:\\Temp\\FTL\\ftl.dat',
    path.join(projectDir, 'ftl.dat.vanilla'),
    path.join(projectDir, 'ftl.dat'),
  ].filter(Boolean);
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return '';
}

function copyProjectForExport(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || /^(tests?|saved|tools|node_modules)$/i.test(entry.name)) continue;
    if (['metadata.json', 'showcase.json', 'README.md'].includes(entry.name)) continue;
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyProjectForExport(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

export function exportFtlWeb(outDir = defaultOutDir) {
  const { NativeRuntime } = require(path.join(forgeRoot, 'Tools', 'native-runtime.cjs'));
  const runtime = NativeRuntime.availability(forgeRoot);
  if (!runtime.available) {
    throw new Error(`Godot executable not available: ${runtime.error || 'unknown'}`);
  }
  const tmpWork = fs.mkdtempSync(path.join(os.tmpdir(), 'ftl-godot-web-export-'));
  try {
    const srcCopy = path.join(tmpWork, 'project');
    copyProjectForExport(projectDir, srcCopy);
    fs.writeFileSync(path.join(srcCopy, 'export_presets.cfg'), WEB_EXPORT_PRESET, 'utf8');
    fs.mkdirSync(outDir, { recursive: true });
    const outHtml = path.join(outDir, 'index.html');

    console.log(`[ftl-web] Importing project with ${path.basename(runtime.executable)}...`);
    const imp = spawnSync(runtime.executable, ['--headless', '--editor', '--path', srcCopy, '--import', '--quit'], {
      encoding: 'utf8',
      timeout: 120000,
      windowsHide: true,
    });
    if (imp.status !== 0) {
      throw new Error(`Godot import failed (${imp.status}):\n${imp.stdout}\n${imp.stderr}`);
    }

    console.log(`[ftl-web] Exporting Godot Web release -> ${outHtml}`);
    const exp = spawnSync(runtime.executable, ['--headless', '--path', srcCopy, '--export-release', 'Web', outHtml], {
      encoding: 'utf8',
      timeout: 180000,
      windowsHide: true,
    });
    if (exp.status !== 0 || !fs.existsSync(outHtml)) {
      throw new Error(`Godot Web export failed (${exp.status}):\n${exp.stdout}\n${exp.stderr}`);
    }
    // Verify required Web files exist
    for (const f of ['index.html', 'index.js', 'index.wasm', 'index.pck']) {
      if (!fs.existsSync(path.join(outDir, f))) {
        throw new Error(`Missing exported Web artifact: ${f}`);
      }
    }
    const pckSize = fs.statSync(path.join(outDir, 'index.pck')).size;
    console.log(`[ftl-web] Web export ready! index.pck = ${(pckSize / 1024).toFixed(1)} KiB`);
    return outDir;
  } finally {
    fs.rmSync(tmpWork, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
}

export function createFtlWebServer({ webDir = defaultOutDir, archivePath = '' } = {}) {
  const pkgPath = findFtlArchive(archivePath);
  const pkg = pkgPath ? new FtlPkgReader(pkgPath) : null;
  const gzipCache = new Map();

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    // 1. FTL PKG streaming endpoints
    if (urlPath === '/ftl-pkg/xml-bundle.json') {
      if (!pkg || !pkg.loaded) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'FTL archive not mounted' }));
        return;
      }
      const bundle = pkg.getXmlBundle();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', bundle.raw.length);
      res.writeHead(200);
      res.end(bundle.raw);
      return;
    }

    if (urlPath.startsWith('/ftl-pkg/raw/')) {
      const rel = urlPath.slice('/ftl-pkg/raw/'.length).replace(/^\/+/, '');
      if (!pkg || !pkg.loaded || rel.includes('..')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const buf = pkg.readEntry(rel);
      if (!buf) {
        res.writeHead(404);
        res.end('Asset not found');
        return;
      }
      const ext = path.extname(rel).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Length', buf.length);
      res.writeHead(200);
      res.end(buf);
      return;
    }

    // 2. Static Godot Web build files
    const relFile = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    if (relFile.includes('..')) {
      res.writeHead(400);
      res.end('Bad path');
      return;
    }
    const full = path.resolve(webDir, relFile);
    if (!full.startsWith(path.resolve(webDir)) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', ext === '.wasm' ? 'public, max-age=600' : 'no-store');
    const acceptGz = String(req.headers['accept-encoding'] || '').includes('gzip');
    if (acceptGz && COMPRESSIBLE.has(ext)) {
      const stat = fs.statSync(full);
      const cacheKey = `${full}:${stat.mtimeMs}:${stat.size}`;
      let gz = gzipCache.get(cacheKey);
      if (!gz) {
        gz = zlib.gzipSync(fs.readFileSync(full), { level: 6 });
        gzipCache.set(cacheKey, gz);
      }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', gz.length);
      res.writeHead(200);
      res.end(gz);
      return;
    }
    const stat = fs.statSync(full);
    res.setHeader('Content-Length', stat.size);
    res.writeHead(200);
    fs.createReadStream(full).pipe(res);
  });

  server.on('close', () => {
    if (pkg) pkg.close();
  });

  return { server, pkg, pkgPath };
}

function parseCli(argv) {
  const opts = {
    export: false,
    exportOnly: false,
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 4190),
    archive: process.env.FTL_DAT_PATH || '',
    outDir: defaultOutDir,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--export') opts.export = true;
    else if (a === '--export-only') { opts.export = true; opts.exportOnly = true; }
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '--archive') opts.archive = argv[++i];
    else if (a === '--out') opts.outDir = path.resolve(argv[++i]);
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const opts = parseCli(process.argv.slice(2));
  if (opts.export || !fs.existsSync(path.join(opts.outDir, 'index.html'))) {
    exportFtlWeb(opts.outDir);
  }
  if (opts.exportOnly) {
    process.exit(0);
  }
  const { server, pkg, pkgPath } = createFtlWebServer({ webDir: opts.outDir, archivePath: opts.archive });
  server.listen(opts.port, opts.host, () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : opts.port;
    console.log(`[ftl-web] Godot 4.7.2 Web server listening: http://localhost:${port}/`);
    console.log(`[ftl-web] FTL PKG bridge: ${pkg && pkg.loaded ? `${pkgPath} (${pkg.entries.size} entries)` : 'fallback (no ftl.dat found)'}`);
  });
}
