'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { findGodot } = require('./native-runtime.cjs');
const { projectEntries, zipFiles } = require('./export-godot-project.cjs');
const { validateDeploymentZip } = require('./deployment-zip-validator.cjs');
const {
  isSealedAvatarPath,
  injectSealedAvatarIntoProjectDir,
  injectPlayHubAvatarAutoload,
  sanitizeProjectForStandardGodot,
} = require('./avatar-seal.cjs');
const { runCloudRunBuild } = require('./cloudrun-build-backend.cjs');
const { buildCorePack, buildThinUgcPack } = require('./build-core-pack.cjs');

const VALID_BUILD_PROFILES = new Set(['playhub-publish', 'standard-godot']);
function resolveBuildProfile(raw) {
  if (raw === undefined || raw === null || raw === '') return 'playhub-publish';
  const normalized = String(raw).trim().toLowerCase();
  if (!VALID_BUILD_PROFILES.has(normalized)) {
    throw Object.assign(new Error('Unsupported buildProfile (expected playhub-publish or standard-godot)'), { status: 400 });
  }
  return normalized;
}

function buildThinUgcArtifact(forgeRoot, snapshot) {
  const entries = snapshot.files ? snapshot.files.map((file) => [file.path, file.content]) : projectEntries(forgeRoot, snapshot);
  const core = buildCorePack(forgeRoot);
  const ugc = buildThinUgcPack(entries, {
    worldId: snapshot.id || 'ugc-world',
    worldName: snapshot.name || 'UGC World',
    mainScene: snapshot.mainScene || 'res://scenes/main.tscn',
  });
  const manifest = {
    schemaVersion: 2,
    packaging: 'modular-thin-ugc',
    worldId: snapshot.id || 'ugc-world',
    revision: snapshot.revision || 1,
    sharedLayers: {
      engineRuntime: '/runtime/godot/4.7.2/',
      corePackUrl: `/api/avatar/runtime/core.pck?v=${core.sha256.slice(0, 12)}`,
      corePackSha256: core.sha256,
      corePackBytes: core.bytes,
      avatarAssetsBaseUrl: '/api/avatar/assets',
    },
    ugcPack: {
      file: 'ugc.pck',
      sha256: ugc.sha256,
      bytes: ugc.bytes,
      fileCount: ugc.fileCount,
      strippedSealedPaths: ugc.strippedCount,
    },
  };
  return { ugc, core, manifest };
}

const PLAYHUB_SHELL_PATH = path.join(__dirname, 'playhub-godot-shell.js');
const PLAYHUB_SHELL_TAG = '<script src="playhub-godot-shell.js"></script>';

function injectPlayHubShell(outputDir) {
  const indexPath = path.join(outputDir, 'index.html');
  if (!fs.existsSync(indexPath) || !fs.existsSync(PLAYHUB_SHELL_PATH)) return false;
  fs.copyFileSync(PLAYHUB_SHELL_PATH, path.join(outputDir, 'playhub-godot-shell.js'));
  const html = fs.readFileSync(indexPath, 'utf8');
  if (html.includes('playhub-godot-shell.js')) return true;
  let patched;
  if (/<\/head>/i.test(html)) patched = html.replace(/<\/head>/i, `  ${PLAYHUB_SHELL_TAG}\n</head>`);
  else if (/<\/body>/i.test(html)) patched = html.replace(/<\/body>/i, `  ${PLAYHUB_SHELL_TAG}\n</body>`);
  else patched = `${html}\n${PLAYHUB_SHELL_TAG}\n`;
  fs.writeFileSync(indexPath, patched, 'utf8');
  return true;
}

const preset = `[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json,*.txt,*.glb"
exclude_filter="addons/playforge_platform/*,addons/playforge_replay/*,addons/playforge_agent_chat/*,addons/playforge_remote_control/*,addons/playforge_service/*,addons/playforge_asset_store/*,.playforge_backups/*"
export_path=""
script_export_mode=0
[preset.0.options]
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
progressive_web_app/enabled=false
`;

const standardGodotPreset = `[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json,*.txt"
exclude_filter="addons/playforge_avatar/*,addons/playforge_platform/*,addons/playforge_replay/*,addons/playforge_agent_chat/*,addons/playforge_remote_control/*,addons/playforge_service/*,addons/playforge_asset_store/*,.playforge_backups/*"
export_path=""
script_export_mode=0
[preset.0.options]
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
progressive_web_app/enabled=false
`;

class BuildQueue {
  constructor(root, directory) {
    this.root = root; this.directory = directory || path.join(root, 'Saved/Builds');
    this.jobs = new Map(); this.pending = []; this.running = false; this.closed = false; this.child = null;
  }
  enqueue(snapshot) {
    if (this.closed) throw new Error('Build queue is closed');
    const buildProfile = resolveBuildProfile(snapshot.buildProfile);
    const sourceHash = crypto.createHash('sha256').update(snapshot.source || JSON.stringify(snapshot.files)).digest('hex');
    if (snapshot.id) {
      for (const job of this.jobs.values()) {
        if (job.projectId === snapshot.id && job.revision === snapshot.revision && job.sourceHash === sourceHash &&
            (job.buildProfile || 'playhub-publish') === buildProfile &&
            (job.ownerKey || null) === (snapshot.ownerKey || null) &&
            (['queued', 'running'].includes(job.status) || (job.status === 'succeeded' && (fs.existsSync(path.join(this.directory, job.id, 'output', 'index.html')) || fs.existsSync(path.join(this.directory, job.id, 'output', 'PlayForge-Web.zip')))))) return this.get(job.id);
      }
    }
    if (this.pending.length >= 3) throw Object.assign(new Error('Build queue limit reached'), { status: 429 });
    if (this.jobs.size >= 20) { for (const [key,value] of this.jobs) { if (['succeeded','failed'].includes(value.status)) { this.jobs.delete(key); break; } } }
    const id = crypto.randomBytes(8).toString('hex');
    const job = { id, target: 'web', buildProfile, avatarIncluded: buildProfile === 'playhub-publish', revision: snapshot.revision, sourceHash,
      projectId: snapshot.id || null, ...(snapshot.ownerKey ? { ownerKey: snapshot.ownerKey } : {}), status: 'queued', createdAt: new Date().toISOString(), log: '', files: [] };
    this.jobs.set(id, job); this.pending.push({ job, snapshot: { ...structuredClone(snapshot), buildProfile } });
    setImmediate(() => this.pump());
    return this.get(id);
  }
  get(id) { if (!/^[a-f0-9]{16}$/.test(id)) return null; let job = this.jobs.get(id); if (!job) { try { job = JSON.parse(fs.readFileSync(path.join(this.directory,id,'result.json'),'utf8')); } catch { return null; } } return structuredClone(job); }
  file(id, filename) {
    const job = this.get(id);
    if (!job || job.status !== 'succeeded' || !job.files.includes(filename)) return null;
    return path.join(this.directory, id, 'output', filename);
  }
  async pump() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while (this.pending.length && !this.closed) {
        const { job, snapshot } = this.pending.shift();
        job.status = 'running'; job.startedAt = new Date().toISOString();
        try { await this.build(job, snapshot); job.status = 'succeeded'; }
        catch (error) { job.status = 'failed'; job.error = error.message; }
        job.finishedAt = new Date().toISOString();
        const folder = path.join(this.directory, job.id);
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify(job, null, 2));
      }
    } finally { this.running = false; }
  }
  async build(job, snapshot) {
    const folder = path.join(this.directory, job.id), project = path.join(folder, 'project'), output = path.join(folder, 'output');
    if (String(process.env.PLAYFORGE_BUILD_BACKEND || '').trim().toLowerCase() === 'cloudrun-job') {
      await runCloudRunBuild(job, snapshot, output);
      return;
    }
    fs.mkdirSync(project, { recursive: true }); fs.mkdirSync(output, { recursive: true });
    const buildProfile = resolveBuildProfile(snapshot.buildProfile);
    const isStandardGodot = buildProfile === 'standard-godot';
    const rawEntries = snapshot.files ? snapshot.files.map(file => [file.path, file.content]) : projectEntries(this.root, snapshot);

    if (snapshot.packaging === 'modular-thin-ugc') {
      if (isStandardGodot) throw new Error('modular-thin-ugc packaging is only supported for playhub-publish builds');
      const thin = buildThinUgcArtifact(this.root, snapshot);
      fs.writeFileSync(path.join(output, 'ugc.pck'), thin.ugc.buffer);
      fs.writeFileSync(path.join(output, 'ugc.manifest.json'), JSON.stringify(thin.manifest, null, 2) + '\n', 'utf8');
      job.files = ['ugc.pck', 'ugc.manifest.json'];
      job.packaging = 'modular-thin-ugc';
      job.buildProfile = buildProfile;
      job.avatarIncluded = true;
      job.artifactSha256 = thin.ugc.sha256;
      job.bytes = thin.ugc.bytes;
      job.entryCount = thin.ugc.fileCount;
      job.sharedCorePackSha256 = thin.core.sha256;
      return;
    }

    const entries = isStandardGodot ? sanitizeProjectForStandardGodot(rawEntries).entries : rawEntries;
    for (const [relative, data] of entries) {
      if (isSealedAvatarPath(relative)) continue;
      let fileData = data;
      if (!isStandardGodot && relative === 'project.godot' && snapshot.files) {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        fileData = injectPlayHubAvatarAutoload(text);
      }
      const file = path.join(project, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, fileData);
    }

    if (!isStandardGodot && snapshot.files) {
      const includeAssets = snapshot.modularAssets === true
        ? false
        : (snapshot.includeAllAvatarAssets === true ? 'all' : 'starter');
      injectSealedAvatarIntoProjectDir(this.root, project, { includeAssets });
    }
    // Raw text files survive Godot's exported resource remapping. The source
    // .gd remains too, so the import phase validates its GDScript syntax.
    if (!snapshot.files) {
    const game = path.join(project, 'Projects/TappyChicken');
    const manifest = JSON.parse(fs.readFileSync(path.join(game, 'project.json')));
    manifest.runtime.entry = 'Scripts/Game.gd.txt';
    fs.writeFileSync(path.join(game, manifest.runtime.entry), snapshot.source);
    for (const asset of manifest.assets) {
      fs.copyFileSync(path.join(game, asset.path), path.join(game, asset.path + '.txt')); asset.path += '.txt';
    }
    fs.writeFileSync(path.join(game, 'project.json'), JSON.stringify(manifest, null, 2));
    }
    fs.writeFileSync(path.join(project, 'export_presets.cfg'), isStandardGodot ? standardGodotPreset : preset);
    await this.run(job, ['--headless', '--path', project, '--editor', '--import', '--quit']);
    await this.run(job, ['--headless', '--path', project, '--export-release', 'Web', path.join(output, 'index.html')]);
    if (!fs.existsSync(path.join(output, 'index.html')) || !fs.existsSync(path.join(output, 'index.wasm')) || !fs.existsSync(path.join(output, 'index.pck'))) throw new Error('Godot did not produce the required Web files');
    const shellInjected = isStandardGodot ? false : injectPlayHubShell(output);
    const zipFilename = isStandardGodot ? 'StandardGodot-Web.zip' : 'PlayForge-Web.zip';
    const names = fs.readdirSync(output).filter(name => fs.statSync(path.join(output, name)).isFile() && name !== zipFilename).sort();
    const zipBuffer = zipFiles(names.map(name => [name, fs.readFileSync(path.join(output, name))]));
    const zipValidation = validateDeploymentZip(zipBuffer);
    fs.writeFileSync(path.join(output, zipFilename), zipBuffer);
    job.buildProfile = buildProfile;
    job.avatarIncluded = !isStandardGodot && Boolean(snapshot.files);
    job.files = [...names, zipFilename];
    job.downloadUrl = '/api/builds/' + job.id + '/files/' + zipFilename;
    job.previewUrl = '/api/builds/' + job.id + '/files/index.html';
    job.artifactSha256 = zipValidation.sha256;
    job.bytes = zipValidation.bytes;
    job.expandedBytes = zipValidation.expandedBytes;
    job.entryCount = zipValidation.entries;
    job.sdkBridgeVersion = shellInjected ? 'playhub-godot-shell-v1' : null;
  }
  run(job, args) {
    if (this.closed) return Promise.reject(new Error('Build cancelled'));
    return new Promise((resolve, reject) => {
      const child = this.child = spawn(findGodot(this.root), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '', timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
      const record = bytes => { output = (output + bytes.toString()).slice(-1000000); };
      child.stdout.on('data', record); child.stderr.on('data', record);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => {
        clearTimeout(timer); if (this.child === child) this.child = null;
        job.log = (job.log + output).slice(-12000);
        fs.appendFileSync(path.join(this.directory, job.id, 'build.log'), output);
        if (code !== 0 || timedOut || /SCRIPT ERROR:|ERROR:/.test(output)) reject(new Error(timedOut ? 'Godot build timed out' : 'Godot build failed; inspect build log'));
        else resolve();
      });
    });
  }
  close() {
    this.closed = true;
    for (const { job } of this.pending.splice(0)) { job.status = 'failed'; job.error = 'Build cancelled'; }
    if (this.child && this.child.exitCode === null) this.child.kill();
  }
}
module.exports = { BuildQueue, injectPlayHubShell, buildThinUgcArtifact, resolveBuildProfile, VALID_BUILD_PROFILES };
