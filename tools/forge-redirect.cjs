'use strict';

const { createServer } = require('node:http');

function createRedirectServer() {
  return createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const target = request.url;
    if (!/^\/(?:api\/health$|OfficialGodot(?:[/?]|$))/.test(target)) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(307, {
      Location: 'http://127.0.0.1:4177' + target,
      'Cache-Control': 'no-store',
      'X-PlayHub-Forge-Redirect': '4177',
    });
    response.end();
  });
}

if (require.main === module) {
  const server = createRedirectServer();
  server.on('error', error => {
    console.error('Could not start the PlayForge redirect: ' + error.code);
    process.exitCode = 1;
  });
  server.listen(4173, '127.0.0.1', () => console.log('PlayForge redirect: http://localhost:4173/OfficialGodot/'));
}

module.exports = { createRedirectServer };
