import fs from 'node:fs';
import path from 'node:path';
import { assembleSurfaceLocaleData } from '../server/l10n-engine.mjs';

const writeChanged = (file, text) => {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
function inject(file, scripts) {
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/\s*<!-- playhub-language:start -->[\s\S]*?<!-- playhub-language:end -->/g, '');
  const block = '\n<!-- playhub-language:start -->\n' + scripts.map(src => `<script src="${src}"></script>`).join('\n') + '\n<!-- playhub-language:end -->';
  if (!/<head\b[^>]*>/i.test(html)) throw new Error('Missing HTML head: ' + file);
  // The local administrator token must be consumed before locale scripts run.
  const bootstrap = html.match(/<script\s+src=["']\/?local-login-bootstrap\.js["']\s*>\s*<\/script>/i)?.[0] || '';
  if (bootstrap) html = html.replace(bootstrap, '');
  writeChanged(file, html.replace(/<head\b[^>]*>/i, tag => tag + bootstrap + block));
}

export function syncLocales({ root, webgames }) {
  const runtime = path.join(root, 'shared/locale.js');
  // Small test fixtures and archives predating localization have no runtime.
  if (!fs.existsSync(runtime)) return;
  const core = fs.readFileSync(runtime, 'utf8');
  const gamesFile = path.join(root, 'shared/locales/games.js');
  if (!fs.existsSync(gamesFile)) throw new Error('Localization dictionaries are missing.');
  const games = fs.readFileSync(gamesFile, 'utf8');
  const { catalogDictionary, surfaceLocaleData } = assembleSurfaceLocaleData({
    root,
    webgames,
    requirePlatform: true,
    requireCatalog: true
  });
  const groups = {
    a: ['rimworld', 'samgukji-11', 'league-of-legends', 'clash-royale'],
    b: ['besiege', 'cosmoteer', 'ftl', 'oxygen-not-included'],
    c: ['brawl-stars', 'this-war-of-mine', 'world-of-tanks', 'world-of-warships', 'survivor-io']
  };
  const catalog = JSON.parse(fs.readFileSync(path.join(webgames, 'catalog.json'), 'utf8'));
  for (const surface of ['user', 'admin']) {
    const folder = path.join(root, 'web', surface);
    writeChanged(path.join(folder, 'locale.js'), core);
    writeChanged(path.join(folder, 'locale-data.js'), surfaceLocaleData);
    inject(path.join(folder, 'index.html'), ['/locale.js', '/locale-data.js']);
  }
  for (const entry of catalog.entries) {
    const folder = path.join(webgames, entry.id, 'Web');
    const group = Object.keys(groups).find(key => groups[key].includes(entry.id));
    const extraFile = group && path.join(root, 'shared/locales', 'imported-' + group + '.js');
    const extra = extraFile && fs.existsSync(extraFile) ? '\n' + fs.readFileSync(extraFile, 'utf8') : '';
    const dedicatedFile = path.join(root, 'shared/locales', entry.id + '.js');
    const dedicated = fs.existsSync(dedicatedFile) ? '\n' + fs.readFileSync(dedicatedFile, 'utf8') : '';
    writeChanged(path.join(folder, 'vendor/playhub-locale.js'), core);
    writeChanged(path.join(folder, 'vendor/playhub-dictionary.js'), games + extra + catalogDictionary + dedicated);
    inject(path.join(folder, 'index.html'), ['vendor/playhub-locale.js', 'vendor/playhub-dictionary.js']);
  }
}
