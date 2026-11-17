'use strict';
const path = require('node:path');
const { createServer } = require('../server.cjs');
const workspace = path.resolve(__dirname, '../Saved/Tests/browser/workspaces', String(Date.now()));
const server = createServer({ workspace });
const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log('Test workspace: http://127.0.0.1:' + port + '/'));
process.on('SIGINT', () => server.shutdown());
process.on('SIGTERM', () => server.shutdown());
