'use strict';

const https = require('node:https');
const { selectLanInterface, isLanPeer } = require('./lan-interface.cjs');
const { getLanTls } = require('./lan-tls.cjs');

function startLanEditor(editor, port, { env = process.env, log = console.log, warn = console.error } = {}) {
  if (env.PLAYFORGE_LAN === '0') return null;
  try {
    const wifi = selectLanInterface(env);
    if (!wifi) {
      warn('LAN link unavailable: no active LAN IPv4 interface was found.');
      return null;
    }
    const host = port === 443 ? wifi.address : `${wifi.address}:${port}`;
    const { key, cert, publicCertPath } = getLanTls(wifi.address, { env });
    const canConnect = request => request.headers.host === host && isLanPeer(request.socket.remoteAddress, wifi.cidr);
    const lan = https.createServer({ key, cert }, (request, response) => {
      if (!canConnect(request)) {
        response.writeHead(403).end('Available on the selected local network only.');
        return;
      }
      editor.emit('request', request, response);
    });
    lan.on('upgrade', (request, socket, head) => {
      if (canConnect(request)) editor.emit('upgrade', request, socket, head);
      else socket.destroy();
    });
    lan.once('error', error => warn('LAN link unavailable: ' + error.message));
    // Close the TLS listener when shutdown starts. An open SSE connection or
    // WebSocket can otherwise outlive the primary HTTP listener.
    const shutdown = editor.shutdown.bind(editor);
    editor.shutdown = () => {
      lan.close();
      lan.closeAllConnections();
      shutdown();
    };
    lan.listen(port, wifi.address, () => {
      log(`PlayForge Wi-Fi (HTTPS): https://${host}/OfficialGodot/`);
      if (!env.PLAYFORGE_LAN_CERT) log('This LAN address uses a local certificate. Your browser must trust it to start the Godot editor.');
      if (publicCertPath) log('LAN certificate: ' + publicCertPath);
    });
    return lan;
  } catch (error) {
    warn('LAN link unavailable: ' + error.message);
    return null;
  }
}

module.exports = { startLanEditor };
