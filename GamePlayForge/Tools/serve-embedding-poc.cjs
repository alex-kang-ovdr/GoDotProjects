'use strict';
const path = require('node:path');
const { createServer } = require('../server.cjs');
const port = Number(process.env.PLAYFORGE_POC_PORT || 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PLAYFORGE_POC_PORT must be a port number.');
const directory = path.resolve(__dirname, '..', 'Saved', 'EmbeddingPoC');
const server = createServer({
  workspace: path.join(directory, 'Workspace'),
  platformWorkspace: path.join(directory, 'Platform'),
  buildDirectory: path.join(directory, 'Builds'),
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`PlayForge embedding PoC: http://127.0.0.1:${port}/OfficialGodot/embedding-poc.html`));
process.on('SIGINT', () => server.shutdown());
process.on('SIGTERM', () => server.shutdown());
