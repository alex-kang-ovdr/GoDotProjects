'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { appendEditorPlugin } = require('./platform-project.cjs');
const { MAIN_SCENE_PATH, showcaseSceneFiles } = require('./template-catalog.cjs');

const root = path.join(__dirname, '..');
const managedAddons = ['playforge_showcase'];
const manifestName = '.playforge-showcase.json';
const mainScene = path.join(...MAIN_SCENE_PATH.split('/'));
const excluded = new Set(['node_modules', 'Saved', 'metadata.json', 'showcase.json']);

function listFiles(directory, relative = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excluded.has(entry.name) || entry.name.endsWith('.import')) continue;
    const entryPath = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(directory, entryPath));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unsupported template entry: ${entryPath}`);
  }
  return files;
}

function prepareTemplateShowcase(templateId, outputDirectory, mode = 'showcase') {
  if (!/^[a-z0-9-]+$/.test(templateId || '') || !outputDirectory || !['ready', 'showcase'].includes(mode)) {
    throw new Error('Usage: node Tools/prepare-template-showcase.cjs <template-id> <new-project-directory> [showcase|ready]');
  }
  const source = path.join(root, 'Templates', templateId);
  const output = path.resolve(outputDirectory);
  const manifestFile = path.join(source, 'showcase.json');
  if (mode === 'showcase' && !fs.existsSync(manifestFile)) throw new Error(`No showcase exists for template ${templateId}`);
  const manifest = mode === 'showcase' ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  if (manifest && (![1, 3].includes(manifest.schemaVersion) || !Array.isArray(manifest.roles) || !Array.isArray(manifest.cues))) {
    throw new Error(`Invalid showcase manifest for template ${templateId}`);
  }

  const files = listFiles(source);
  const addons = managedAddons.map(name => {
    const directory = path.join(root, 'Godot', 'addons', name);
    const files = listFiles(directory).filter(file => process.platform === 'win32' || !/\.(?:dll|gdextension)$/.test(file));
    if (!files.includes('plugin.cfg') || !files.includes('plugin.gd')) throw new Error(`Incomplete editor plugin: ${name}`);
    return { name, directory, files };
  });
  const replayFiles = manifest?.schemaVersion === 3
    ? showcaseSceneFiles(fs.readFileSync(path.join(source, mainScene), 'utf8'))
    : {};
  const project = fs.readFileSync(path.join(source, 'project.godot'), 'utf8');
  const editorProject = managedAddons.reduce((config, name) => appendEditorPlugin(config, `res://addons/${name}/plugin.cfg`), project);

  try {
    fs.mkdirSync(output);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`The output directory must be new: ${output}`);
    throw error;
  }

  try {
    for (const file of files) {
      if (file === 'project.godot' || Object.hasOwn(replayFiles, file.split(path.sep).join('/'))) continue;
      copyNewFile(path.join(source, file), path.join(output, file));
    }
    for (const [file, content] of Object.entries(replayFiles)) {
      const destination = path.join(output, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content, { flag: 'wx' });
    }
    for (const addon of addons) {
      for (const file of addon.files) {
        copyNewFile(path.join(addon.directory, file), path.join(output, 'addons', addon.name, file));
      }
    }
    if (manifest) copyNewFile(manifestFile, path.join(output, manifestName));
    fs.writeFileSync(path.join(output, 'project.godot'), editorProject, { flag: 'wx' });
  } catch (error) {
    throw new Error(`Could not finish writing the showcase in ${output}: ${error.message}`, { cause: error });
  }
  return path.join(output, 'project.godot');
}

function copyNewFile(source, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(source, output, fs.constants.COPYFILE_EXCL);
}

if (require.main === module) {
  try {
    process.stdout.write(`${prepareTemplateShowcase(process.argv[2], process.argv[3], process.argv[4])}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { prepareTemplateShowcase };
