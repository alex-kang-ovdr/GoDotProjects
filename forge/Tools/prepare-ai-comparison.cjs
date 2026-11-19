'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { appendEditorPlugin } = require('./platform-project.cjs');
const { prepareTemplateShowcase } = require('./prepare-template-showcase.cjs');

const forge = path.resolve(__dirname, '..');
const demoDirectory = path.join(forge, 'Saved', 'Demos');
const managedAddons = ['playforge_replay', 'playforge_agent_chat'];
const uvReleases = {
  x64: {
    target: 'x86_64-pc-windows-msvc',
    sha256: 'edd61f7f5728a56cc62455386661860bdfc7bab65872f39b0c25bdcc1d8e1beb',
  },
  arm64: {
    target: 'aarch64-pc-windows-msvc',
    sha256: '72eed595983a4d7d22d79f21065b0f4479cc7e5c7a89104bb410c8f47559a878',
  },
};
const gdmcpRevision = '25707f56775486e4f6c5af90d7f3452f461b8dc8';
const assistantHubRevision = '90cdc127cd64baf08ab9c7b065797ad52fe86311';
const comparisons = {
  'godot-ai': {
    directory: 'GodotAI-Comparison',
    addon: 'godot_ai',
    url: 'https://github.com/hi-godot/godot-ai/releases/download/v4.3.1/godot-ai-v4-plugin.zip',
    sha256: '1ef6dcb3a1d56e37116ca02292cf7698afebf9e5b6152f6517e57aa0dfcc8fc2',
  },
  gdmcp: {
    directory: 'GDMCP-Comparison',
    addon: 'gdmcp',
    archiveRoot: 'GDMCP-' + gdmcpRevision,
    url: 'https://codeload.github.com/theLegend35/GDMCP/zip/' + gdmcpRevision,
    sha256: 'b31730a4a78a3d371b38392d4d270bbb0c813cab9c181fcc4200c9d3fdea673e',
  },
  'assistant-hub': {
    directory: 'AIAssistantHub-Comparison',
    addon: 'ai_assistant_hub',
    archiveRoot: 'godot-ai-assistant-hub-' + assistantHubRevision,
    url: 'https://codeload.github.com/FlamxGames/godot-ai-assistant-hub/zip/' + assistantHubRevision,
    sha256: 'abc30557e864089054fbfca60b62c45cbf64270e553e4606e9f4b2856ad5e735',
    license: {
      url: 'https://raw.githubusercontent.com/FlamxGames/godot-ai-assistant-hub/' + assistantHubRevision + '/LICENSE',
      sha256: '207702686b6e6fdb192e304722e897cdc5367b4fd6413f8febdd86aaac1af991',
    },
  },
};

function enableAddon(project, addon) {
  const original = fs.readFileSync(project, 'utf8');
  const updated = appendEditorPlugin(original, 'res://addons/' + addon + '/plugin.cfg');
  if (updated !== original) fs.writeFileSync(project, updated);
}

function digest(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function downloadFile(name, release, destination) {
  const response = await fetch(release.url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Could not download ' + name + ' (HTTP ' + response.status + ')');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== release.sha256) throw new Error('Release checksum mismatch for ' + name);
  fs.writeFileSync(destination, bytes);
}

function extractZip(name, archive, output, entries = []) {
  const result = spawnSync('tar', ['-xf', archive, '-C', output, ...entries], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not extract ' + name + ': ' + result.stderr.trim());
}

async function prepareGodotAiUv() {
  if (spawnSync('uvx', ['--version'], { stdio: 'ignore', windowsHide: true }).status === 0) return '';
  const release = process.platform === 'win32' ? uvReleases[process.arch] : undefined;
  if (!release) return '';
  const root = path.join(forge, 'Saved', 'Tools', 'uv');
  const output = path.join(root, process.arch);
  const executable = path.join(output, 'uvx.exe');
  if (fs.existsSync(executable)) return output;
  fs.mkdirSync(root, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(root, '.install-'));
  try {
    const archive = path.join(scratch, 'release.zip');
    const url = 'https://github.com/astral-sh/uv/releases/download/0.13.9/uv-' + release.target + '.zip';
    await downloadFile('uv', { url, sha256: release.sha256 }, archive);
    const extracted = path.join(scratch, 'bin');
    fs.mkdirSync(extracted);
    extractZip('uv', archive, extracted);
    if (!fs.existsSync(path.join(extracted, 'uvx.exe')) || !fs.existsSync(path.join(extracted, 'uv.exe'))) {
      throw new Error('The uv archive lacks uv.exe or uvx.exe');
    }
    if (!fs.existsSync(executable)) fs.renameSync(extracted, output);
    return output;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function syncManagedAddons(output) {
  const statePath = path.join(output, '.playforge-comparison-files.json');
  const oldState = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : '{}';
  const state = JSON.parse(oldState);
  for (const addon of managedAddons) {
    const source = path.join(forge, 'Godot', 'addons', addon);
    for (const entry of fs.readdirSync(source, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:gd(?:\.uid)?|cfg|gdextension|dll)$/.test(entry.name)) continue;
      if (process.platform !== 'win32' && /\.(?:gdextension|dll)$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      const relative = 'addons/' + addon + '/' + path.relative(source, file).split(path.sep).join('/');
      const destination = path.join(output, relative);
      const incoming = fs.readFileSync(file);
      const expected = digest(incoming);
      if (fs.existsSync(destination)) {
        const actual = digest(fs.readFileSync(destination));
        if (actual === expected) {
          state[relative] = expected;
          continue;
        }
        if (actual !== state[relative]) continue;
      } else if (Object.hasOwn(state, relative)) {
        continue;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, incoming);
      state[relative] = expected;
    }
  }
  const nextState = JSON.stringify(state);
  if (nextState !== oldState) fs.writeFileSync(statePath, nextState);
}

async function prepareAiComparison(id) {
  if (!Object.hasOwn(comparisons, id)) {
    throw new Error('Usage: node Tools/prepare-ai-comparison.cjs godot-ai|gdmcp|assistant-hub');
  }
  if (id === 'godot-ai') await prepareGodotAiUv();
  const release = comparisons[id];
  const output = path.join(demoDirectory, release.directory);
  const project = path.join(output, 'project.godot');
  const addon = path.join(output, 'addons', release.addon);
  if (fs.existsSync(addon)) {
    if (!fs.existsSync(project) || !fs.existsSync(path.join(addon, 'plugin.cfg'))) {
      throw new Error('Comparison project is incomplete at ' + output);
    }
    syncManagedAddons(output);
    return output;
  }

  fs.mkdirSync(demoDirectory, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(demoDirectory, '.compare-ai-'));
  try {
    const archive = path.join(scratch, 'release.zip');
    await downloadFile(id, release, archive);

    const archiveAddon = [release.archiveRoot, 'addons', release.addon].filter(Boolean).join('/');
    extractZip(id, archive, scratch, [archiveAddon]);
    const extracted = path.join(scratch, archiveAddon);
    if (!fs.existsSync(path.join(extracted, 'plugin.cfg'))) {
      throw new Error('Release did not contain ' + archiveAddon + '/plugin.cfg');
    }
    if (release.license) await downloadFile(id + ' license', release.license, path.join(extracted, 'LICENSE'));
    if (id === 'gdmcp' && fs.existsSync(path.join(extracted, 'previews'))) {
      // GDMCP ships README previews as JPEG files with .png names.
      fs.writeFileSync(path.join(extracted, 'previews', '.gdignore'), '');
    }

    if (!fs.existsSync(project)) {
      const staged = path.join(scratch, 'project');
      prepareTemplateShowcase('blank3d', staged, 'ready');
      fs.cpSync(extracted, path.join(staged, 'addons', release.addon), { recursive: true, force: false, errorOnExist: true });
      enableAddon(path.join(staged, 'project.godot'), release.addon);
      syncManagedAddons(staged);
      fs.renameSync(staged, output);
    } else if (!fs.existsSync(addon)) {
      fs.mkdirSync(path.dirname(addon), { recursive: true });
      fs.cpSync(extracted, addon, { recursive: true, force: false, errorOnExist: true });
      enableAddon(project, release.addon);
      syncManagedAddons(output);
    }
    return output;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function prepareComparisonForLaunch(id) {
  const output = await prepareAiComparison(id);
  if (id !== 'assistant-hub') return output;
  const { ensureLocalOllama } = require('./local-ollama.cjs');
  const { model, running } = await ensureLocalOllama();
  if (!running) {
    console.error('Ollama is unavailable at http://127.0.0.1:11434. Start Ollama, then refresh models in AI Hub.');
  } else if (model) {
    const directory = path.join(output, 'addons', comparisons[id].addon, 'assistants');
    const preset = `[gd_resource type="Resource" script_class="AIAssistantResource" load_steps=3 format=3]

[ext_resource type="Script" path="res://addons/ai_assistant_hub/assistants/ai_assistant_resource.gd" id="1"]
[ext_resource type="Resource" path="res://addons/ai_assistant_hub/llm_providers/ollama.tres" id="2"]

[resource]
script = ExtResource("1")
type_name = "PlayForge Godot"
ai_model = ${JSON.stringify(model)}
llm_provider = ExtResource("2")
ai_description = "Help with Godot scenes and GDScript. Start by inspecting the current scene and explain the intended changes before requesting edits."
context_length = 4096
`;
    try {
      fs.writeFileSync(path.join(directory, 'playforge_godot.tres'), preset, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  } else {
    console.error('No preferred tool-ready model was found. Pick an installed model in AI Hub.');
  }
  return output;
}

if (require.main === module) {
  prepareComparisonForLaunch(process.argv.length === 3 ? process.argv[2] : undefined).then(
    output => { process.stdout.write(output + '\n'); },
    error => {
      process.stderr.write(error.message + '\n');
      process.exitCode = 1;
    },
  );
}

module.exports = { prepareAiComparison, prepareGodotAiUv };
