#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const buildRoot = path.join(projectRoot, 'Build');
const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const root = path.resolve(argument('--root') || path.join(buildRoot, 'PC', 'CaptainSalvage'));
if (!root.startsWith(`${buildRoot}${path.sep}`) || !fs.existsSync(path.join(root, 'index.html'))) throw new Error(`유효한 PC 빌드 폴더가 아닙니다: ${root}`);
const port = Number(argument('--port') || 4173);

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent((request.url || '/').split('?')[0]);
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, requested);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Captain Salvage PC 빌드 실행 중: ${url}`);
  console.log('종료하려면 이 콘솔에서 Ctrl+C를 누르세요.');
  if (process.argv.includes('--open')) {
    const child = spawn('cmd.exe', ['/d', '/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    child.unref();
  }
});
