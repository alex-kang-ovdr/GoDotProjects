'use strict';
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('esbuild').buildSync({ absWorkingDir: root, entryPoints: ['Tools/yjs-entry.js'], bundle: true, format: 'iife', globalName: 'GamePlayForgeY', outfile: 'assets/gameplayforge-y.js', minify: true, legalComments: 'eof' });
