import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStoreApp, parseAllowedOrigins } from './store-api.mjs';
import { createCatalogArtifacts } from './package-builder.mjs';
import { SAMPLE_CATALOG, validateReleaseContract } from '../web/store-catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(HERE, '..');
const DEFAULT_PORT = 4180;
const DEFAULT_HOST = '127.0.0.1';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::']);

const REQUIRED_WEB_FILES = ['index.html', 'store.js', 'store-catalog.js', 'store.css'];

export function loadMergedCatalog(storeRoot = STORE_ROOT) {
  const collectedPath = path.join(storeRoot, 'data', 'collected-catalog.json');
  const merged = [...SAMPLE_CATALOG];
  const seen = new Set(merged.map((item) => item.asset_id));
  if (fs.existsSync(collectedPath)) {
    const raw = JSON.parse(fs.readFileSync(collectedPath, 'utf8'));
    const extra = Array.isArray(raw?.items) ? raw.items : [];
    for (const item of extra) {
      if (item?.asset_id && !seen.has(item.asset_id)) {
        seen.add(item.asset_id);
        merged.push(item);
      }
    }
  }
  return merged;
}

export function parseCliArgs(argv = process.argv.slice(2), env = process.env) {
  let check = false;
  let noBrowser = env.PLAYHUB_NO_BROWSER === '1';
  let port = Number(env.STORE_PORT ?? env.PORT ?? DEFAULT_PORT);
  let host = String(env.STORE_HOST ?? env.HOST ?? DEFAULT_HOST);
  let dataDir = path.resolve(
    env.PLAYFORGE_STORE_DATA_DIR || env.STORE_DATA_DIR || path.join(STORE_ROOT, 'Saved')
  );
  let allowMockSession = env.PLAYFORGE_STORE_ALLOW_MOCK_SESSION === '1';
  let rawAllowedOrigins =
    env.PLAYFORGE_STORE_ALLOWED_ORIGINS ?? env.STORE_ALLOWED_ORIGINS ?? env.PUBLIC_ORIGIN ?? null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      check = true;
    } else if (arg === '--no-browser') {
      noBrowser = true;
    } else if (arg === '--allow-mock-session') {
      allowMockSession = true;
    } else if (arg === '--allowed-origins') {
      const next = argv[++i];
      if (!next) throw new Error('Missing --allowed-origins value');
      rawAllowedOrigins = next;
    } else if (arg === '--port') {
      const next = argv[++i];
      if (next === undefined || !/^\d+$/.test(next)) {
        throw new Error('Invalid --port value');
      }
      port = Number(next);
    } else if (arg === '--host') {
      const next = argv[++i];
      if (!next) throw new Error('Missing --host value');
      host = next;
    } else if (arg === '--data-dir') {
      const next = argv[++i];
      if (!next) throw new Error('Missing --data-dir value');
      dataDir = path.resolve(next);
    } else {
      throw new Error(
        `Usage: Run_Store.bat [--check] [--port <port>] [--host <host>] [--data-dir <dir>] [--allowed-origins <csv>] [--allow-mock-session] [--no-browser]`
      );
    }
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  const isLoopback = LOOPBACK_HOSTS.has(host);
  if (!isLoopback && env.PLAYFORGE_STORE_ALLOW_NON_LOOPBACK !== '1') {
    throw new Error(`Store HOST must be loopback (got ${host})`);
  }

  let allowedOrigins = parseAllowedOrigins(rawAllowedOrigins);
  if (!isLoopback && !allowedOrigins && !WILDCARD_HOSTS.has(host) && port > 0) {
    const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    allowedOrigins = [new URL(`http://${formattedHost}:${port}`).origin];
  }

  return { check, noBrowser, port, host, dataDir, allowMockSession, allowedOrigins };
}

export function checkStorePrerequisites({
  storeRoot = STORE_ROOT,
  dataDir = path.join(STORE_ROOT, 'Saved'),
  nodeVersion = process.versions.node
} = {}) {
  const issues = [];
  const major = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    issues.push(`Node.js 22 or newer is required (current ${nodeVersion})`);
  }

  const schemaFile = path.join(storeRoot, 'schemas', 'package-contract.schema.json');
  if (!fs.existsSync(schemaFile)) {
    issues.push(`Missing schema file: ${schemaFile}`);
  } else {
    try {
      JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
    } catch (error) {
      issues.push(`Invalid schema JSON: ${error.message}`);
    }
  }

  const webDir = path.join(storeRoot, 'web');
  for (const name of REQUIRED_WEB_FILES) {
    const filePath = path.join(webDir, name);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      issues.push(`Missing Store web file: ${path.relative(storeRoot, filePath)}`);
    }
  }

  let catalog = [...SAMPLE_CATALOG];
  try {
    catalog = loadMergedCatalog(storeRoot);
  } catch (error) {
    issues.push(`Failed to load collected catalog JSON: ${error.message}`);
  }

  for (const entry of catalog) {
    const errors = validateReleaseContract(entry);
    if (errors.length > 0) {
      issues.push(`Contract error in ${entry.asset_id}: ${errors.join(', ')}`);
      if (issues.length > 20) break;
    }
  }

  try {
    const artifacts = createCatalogArtifacts(catalog);
    const packageCount = catalog.filter((x) => x.release_kind === 'package').length;
    if (artifacts.size !== packageCount) {
      issues.push(`Expected ${packageCount} package artifacts, built ${artifacts.size}`);
    }
  } catch (error) {
    issues.push(`Artifact digest verification failed: ${error.message}`);
  }

  try {
    let probe = path.resolve(dataDir);
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    fs.accessSync(probe, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    issues.push(`Store dataDir is not writable (${dataDir}): ${error.message}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    nodeVersion,
    catalogCount: catalog.length,
    packageCount: catalog.filter((x) => x.release_kind === 'package').length,
    editorialCount: catalog.filter((x) => x.release_kind === 'editorial').length,
    dataDir
  };
}

function openBrowser(url) {
  const command = {
    win32: ['rundll32.exe', ['url.dll,FileProtocolHandler', url]],
    darwin: ['open', [url]]
  }[process.platform] || ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
}

async function main() {
  const opts = parseCliArgs();
  const report = checkStorePrerequisites({ dataDir: opts.dataDir });
  if (!report.ok) {
    console.error(report.issues.join('\n'));
    process.exitCode = 1;
    return;
  }

  if (opts.check) {
    console.log(
      `Store ready (Node ${process.versions.node}): ${report.catalogCount} catalog entries (${report.packageCount} packages, ${report.editorialCount} editorial), dataDir=${report.dataDir}`
    );
    return;
  }

  const catalog = loadMergedCatalog(STORE_ROOT);
  const app = createStoreApp({
    dataDir: opts.dataDir,
    webDir: path.join(STORE_ROOT, 'web'),
    serveStatic: true,
    catalog,
    allowMockSession: opts.allowMockSession,
    allowedOrigins: opts.allowedOrigins
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    const addr = await app.listen(opts.port, opts.host);
    const displayHost = addr.address === '::1' ? '[::1]' : addr.address === '::' ? '[::]' : addr.address;
    const url = `http://${displayHost}:${addr.port}/`;
    console.log(`PlayForge Store ready: ${url}`);
    console.log(`Store data directory: ${opts.dataDir}`);
    if (!opts.noBrowser) {
      openBrowser(url);
    }
  } catch (error) {
    console.error(`PlayForge Store failed to start: ${error.message}`);
    await app.close();
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
