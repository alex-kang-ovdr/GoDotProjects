'use strict';

const { createHash } = require('node:crypto');
const { zipFiles } = require('./export-godot-project.cjs');
const { loadAssetStore } = require('./template-catalog.cjs');

const PREFIX = '/api/asset-library';
const SLUG = 'tappy-original';
const LICENSE = 'Local sample';
const PUBLISHER = { name: 'PlayForge Local', slug: 'playforge-local', verified: false };
const TAGS = [{ display_name: '2D Assets', slug: '2d' }];
const MIN_GODOT_VERSION = '4.7';
const ARCHIVE_PATH = `/packs/${SLUG}.zip`;
const ASSET_PATH = `/assets/${PUBLISHER.slug}/${SLUG}`;
const SHORT_ASSET_PATH = `/assets/${SLUG}`;
const RELEASE_PATH = `/releases/${PUBLISHER.slug}/${SLUG}`;

function isLoopback(address) {
  return address === '::1' || address === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(address?.replace(/^::ffff:/, ''));
}

function localOrigin(request) {
  if (!isLoopback(request.socket.remoteAddress)) return null;
  try {
    const url = new URL(`http://${request.headers.host}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.hostname === 'localhost' || isLoopback(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

function buildPacks(root) {
  const { catalog, sources } = loadAssetStore(root);
  return new Map(catalog.packs.map(pack => {
    // Godot's Store installer strips its ZIP's single top-level folder by default.
    const archive = zipFiles(pack.files.map(file => [`${pack.id}/${file}`, sources[file]]));
    return [pack.id, { pack, archive, sha256: createHash('sha256').update(archive).digest('hex'),
      thumbnail: Buffer.from(sources[pack.files[0]]) }];
  }));
}

function assetDetails(localPack, base) {
  return {
    name: localPack.pack.title,
    slug: SLUG,
    publisher: PUBLISHER,
    license_type: LICENSE,
    license_url: '',
    reviews_score: 0,
    store_url: base + ASSET_PATH,
    thumbnail: base + ASSET_PATH + '/thumbnail.svg',
  };
}

function matchesSearch(params, localPack) {
  if (params.get('type') && params.get('type') !== '0') return false;
  const licenses = params.getAll('licenses');
  if (licenses.length && !licenses.includes(LICENSE)) return false;
  const version = params.get('compatibility');
  if (version) {
    const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(version);
    const [major, minor] = MIN_GODOT_VERSION.split('.').map(Number);
    if (!match || +match[1] < major || (+match[1] === major && +match[2] < minor)) return false;
  }
  const query = (params.get('query') || '').toLowerCase().trim();
  const terms = query.match(/#[\w-]+|[^\s#]+/g) || [];
  const description = `${localPack.pack.title} ${localPack.pack.description} ${SLUG} Epic Games graphics audio 2D assets`.toLowerCase();
  return terms.every(term => term.startsWith('#') ? TAGS.some(tag => term === '#' + tag.slug) : description.includes(term));
}

function send(response, status, type, content, headers = {}) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...headers,
  });
  response.end(content);
}

function json(response, status, body) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

function createAssetLibraryHandler(root) {
  let packs;
  return (request, response) => {
    if (!request.url?.startsWith(PREFIX)) return false;
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return false;
    const origin = localOrigin(request);
    if (!origin) {
      json(response, 403, { error: 'Asset library is available on loopback only.' });
      return true;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      json(response, 405, { error: 'Asset library is read-only.' });
      return true;
    }
    const route = url.pathname.slice(PREFIX.length).replace(/\/$/, '');
    const base = origin + PREFIX;
    try {
      packs ||= buildPacks(root);
    } catch {
      json(response, 503, { error: 'Asset library unavailable.' });
      return true;
    }
    const localPack = packs.get(SLUG);
    const packSlug = /^\/packs\/([a-z0-9-]+)\.zip$/.exec(route)?.[1];
    const download = packs.get(packSlug);
    if (route === '') {
      json(response, 200, { name: 'PlayForge Local' });
    } else if (route === '/tags') {
      json(response, 200, localPack ? TAGS : []);
    } else if (route === '/licenses') {
      json(response, 200, localPack ? [{ type: LICENSE }] : []);
    } else if (route === '/search/query') {
      const count = localPack && matchesSearch(url.searchParams, localPack) ? 1 : 0;
      const firstPage = (url.searchParams.get('page') || '1') === '1';
      json(response, 200, { count, hits: count && firstPage ? [{ asset: assetDetails(localPack, base) }] : [] });
    } else if (localPack && (route === ASSET_PATH || route === SHORT_ASSET_PATH)) {
      json(response, 200, {
        ...assetDetails(localPack, base),
        body_bbcode: `${localPack.pack.description}\nOriginal artwork and sound by Epic Games.`,
        source: '',
        tags: TAGS,
      });
    } else if (localPack && route === RELEASE_PATH) {
      json(response, 200, [{
        version: '1.0.0',
        stable: true,
        min_godot_version: MIN_GODOT_VERSION,
        max_godot_version: null,
        changes_bbcode: localPack.pack.description,
        download_url: `${base}${ARCHIVE_PATH}?sha256=${localPack.sha256}`,
        sha256: localPack.sha256,
      }]);
    } else if (download && (!url.searchParams.has('sha256') || url.searchParams.get('sha256') === download.sha256)) {
      send(response, 200, 'application/zip', download.archive, {
        'Content-Length': download.archive.length,
        'Content-Disposition': `attachment; filename="${packSlug}.zip"`,
        'ETag': `"${download.sha256}"`,
      });
    } else if (localPack && route === ASSET_PATH + '/thumbnail.svg') {
      send(response, 200, 'image/svg+xml', localPack.thumbnail);
    } else {
      json(response, 404, { error: 'Asset library entry not found.' });
    }
    return true;
  };
}

module.exports = { createAssetLibraryHandler };
