#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const buildRoot = path.join(projectRoot, 'Build');
const inputNames = ['assets', 'data', 'index.html', 'styles.css', 'game.js', 'sw.js', 'manifest.webmanifest'];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function ensureBuildPath(candidate) {
  const resolved = path.resolve(candidate);
  const prefix = `${buildRoot}${path.sep}`;
  if (resolved !== buildRoot && !resolved.startsWith(prefix)) throw new Error(`Build 폴더 밖에는 출력할 수 없습니다: ${resolved}`);
  return resolved;
}

function copyEntry(name, outputRoot) {
  const source = path.join(projectRoot, name);
  const destination = path.join(outputRoot, name);
  if (!fs.existsSync(source)) throw new Error(`필수 배포 자산이 없습니다: ${name}`);
  fs.cpSync(source, destination, { recursive: true, force: true, dereference: true });
}

const target = argument('--target') || 'web';
const output = ensureBuildPath(argument('--out') || path.join(buildRoot, 'Web', 'CaptainSalvage'));
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
inputNames.forEach((name) => copyEntry(name, output));
fs.writeFileSync(path.join(output, 'build-info.json'), `${JSON.stringify({ target, app: 'Captain Salvage', format: 'static-web' }, null, 2)}\n`);
console.log(`[BUILD PASS] ${target}: ${output}`);
