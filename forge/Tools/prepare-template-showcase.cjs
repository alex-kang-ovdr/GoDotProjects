'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { appendEditorPlugin } = require('./platform-project.cjs');

const root = path.join(__dirname, '..');
const addonName = 'playforge_showcase';
const addonRoot = path.join(root, 'Godot', 'addons', addonName);
const addonConfig = `res://addons/${addonName}/plugin.cfg`;
const manifestName = '.playforge-showcase.json';
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

function prepareTemplateShowcase(templateId, outputDirectory) {
  if (!/^[a-z0-9-]+$/.test(templateId || '') || !outputDirectory) {
    throw new Error('Usage: node Tools/prepare-template-showcase.cjs <template-id> <new-project-directory>');
  }
  const source = path.join(root, 'Templates', templateId);
  const output = path.resolve(outputDirectory);
  const manifestFile = path.join(source, 'showcase.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`No showcase exists for template ${templateId}`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.roles) || !Array.isArray(manifest.cues)) {
    throw new Error(`Invalid showcase manifest for template ${templateId}`);
  }

  const files = listFiles(source);
  const addonFiles = listFiles(addonRoot);
  if (!addonFiles.includes('plugin.cfg') || !addonFiles.includes('plugin.gd')) {
    throw new Error('The shared showcase editor plugin is incomplete');
  }
  const project = fs.readFileSync(path.join(source, 'project.godot'), 'utf8');
  const editorProject = project.includes(`"${addonConfig}"`) ? project : appendEditorPlugin(project, addonConfig);

  try {
    fs.mkdirSync(output);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`The output directory must be new: ${output}`);
    throw error;
  }

  try {
    for (const file of files) {
      if (file === 'project.godot') continue;
      copyNewFile(path.join(source, file), path.join(output, file));
    }
    for (const file of addonFiles) {
      copyNewFile(path.join(addonRoot, file), path.join(output, 'addons', addonName, file));
    }
    copyNewFile(manifestFile, path.join(output, manifestName));
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
    process.stdout.write(`${prepareTemplateShowcase(process.argv[2], process.argv[3])}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { prepareTemplateShowcase };
