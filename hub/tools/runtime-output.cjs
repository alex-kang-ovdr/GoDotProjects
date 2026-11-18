'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Startup reads the deployed output only. Source synchronization and compilation
// belong to the explicitly invoked manual deployment, never to a Run command.
const requiredOutput = ['user/index.html', 'user/config.js', 'user/catalog/games.json',
  'admin/index.html', 'admin/config.js'];
function assertRuntimeOutput(root, config = {}) {
  const required = config.admin?.localAutoLogin === true
    ? [...requiredOutput, 'admin/local-login-bootstrap.js'] : requiredOutput;
  for (const relative of required) {
    const file = path.join(root, 'dist', relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error('Missing deployed Hub output: dist/' + relative +
        '. Ask the AI to complete manual deployment first. Startup does not synchronize or build.');
    }
  }
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'dist/user/catalog/games.json'), 'utf8'));
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries) || catalog.entries.length > 1000) throw new Error();
    const ids = new Set();
    for (const entry of catalog.entries) {
      if (!entry || typeof entry.id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id) ||
          entry.path !== 'games/' + entry.id || typeof entry.enabled !== 'boolean') throw new Error();
      ids.add(entry.id);
    }
  } catch { throw new Error('Invalid deployed Hub catalog. Complete manual deployment before startup.'); }
  for (const [surface, name, port] of [['user', 'PLAYHUB_CONFIG', config.publicPort || 8090],
    ['admin', 'PLAYHUB_ADMIN_CONFIG', config.adminPort || 8091]]) {
    try {
      const script = fs.readFileSync(path.join(root, 'dist', surface, 'config.js'), 'utf8');
      const match = script.match(new RegExp('^window\\.' + name + '=(.+);\\s*$', 's'));
      const deployed = JSON.parse(match?.[1]);
      if (deployed.apiPort !== port || deployed.apiBaseUrl !== '') throw new Error();
    } catch { throw new Error('Deployed ' + surface + ' API settings do not match the selected configuration. Complete manual deployment before startup.'); }
  }
  if (config.admin?.localAutoLogin === true &&
      !/<script\s+src=["']\/?local-login-bootstrap\.js["']\s*>/.test(fs.readFileSync(path.join(root, 'dist/admin/index.html'), 'utf8'))) {
    throw new Error('Deployed administrator page needs the local login bootstrap. Complete manual deployment before enabling localAutoLogin.');
  }
  return { user: path.join(root, 'dist/user'), admin: path.join(root, 'dist/admin') };
}
module.exports = { assertRuntimeOutput, requiredOutput };
