'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MAIN_SCENE_PATH = 'scenes/main.tscn';
const SHOWCASE_SOURCE_PATH = 'playforge_replay_source.tscn';
const STORE_ASSET_PATH = /^Assets\/(?:[\w-]+\.svg|Audio\/[\w-]+\.tres)$/;

function loadAssetStore(root) {
  const flightPack = {
    id: 'tappy-flight',
    title: 'Tappy Chicken 비행 텍스처',
    description: '닭이 날개를 올리고 내리는 두 프레임과 충돌 프레임을 가져옵니다.',
    files: ['Assets/chicken-wing-up.svg', 'Assets/chicken-wing-down.svg', 'Assets/chicken-hit.svg'],
  };
  const source = path.join(root, 'Templates', 'tappy-chicken');
  const metadata = path.join(source, 'metadata.json');
  const originalPack = {
    id: 'tappy-original',
    title: 'Tappy Chicken 원작 그래픽과 효과음',
    description: '원작 그래픽 21개와 효과음 8개를 프로젝트로 가져옵니다.',
    files: fs.existsSync(metadata) ? JSON.parse(fs.readFileSync(metadata, 'utf8')).assetPaths : [],
  };
  const packs = [flightPack, originalPack].filter(({ files }) => Array.isArray(files) && files.length > 0 &&
    new Set(files).size === files.length && files.every(file => typeof file === 'string' && STORE_ASSET_PATH.test(file) && fs.existsSync(path.join(source, file))));
  const files = new Set(packs.flatMap(pack => pack.files));
  const sources = Object.fromEntries([...files].map(file => [file, fs.readFileSync(path.join(source, file), 'utf8')]));
  return { catalog: { packs }, sources };
}

function showcaseStagedFiles(manifest) {
  if (manifest?.schemaVersion !== 3) return [];
  const assets = manifest.cues.filter(cue => cue.action === 'import').flatMap(cue => cue.staged || []);
  const bootstrap = manifest.bootstrapFiles || [];
  if (assets.some(file => typeof file !== 'string' || !STORE_ASSET_PATH.test(file)) ||
      !Array.isArray(bootstrap) || bootstrap.some(file => typeof file !== 'string' ||
        (file !== SHOWCASE_SOURCE_PATH && !/^Scripts\/[\w-]+\.gd$/.test(file)))) {
    throw new Error('Invalid showcase staging path.');
  }
  return [...new Set([...assets, ...bootstrap])];
}

function showcaseSceneFiles(mainScene) {
  const root = /^\[node name="[^"\r\n]+" type="(Node[23]D)"\]/m.exec(mainScene);
  if (!root) throw new Error('The showcase source must have a Node2D or Node3D root.');
  return {
    [MAIN_SCENE_PATH]: `[gd_scene format=3]\n\n[node name="ForgeReplay" type="${root[1]}"]\n`,
    [SHOWCASE_SOURCE_PATH]: mainScene,
  };
}
function loadGameTemplates(root) {
  const directory = path.join(root, 'Templates');
  const result = {};
  if (!fs.existsSync(directory)) return result;
  for (const folder of fs.readdirSync(directory, {withFileTypes:true})) {
    if (!folder.isDirectory()) continue;
    const base = path.join(directory,folder.name), metaPath = path.join(base,'metadata.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath,'utf8'));
    if (!/^[a-z0-9-]+$/.test(meta.id) || !['2d','3d'].includes(meta.dimension)) throw Error('Invalid template metadata: '+folder.name);
    const showcasePath = path.join(base, 'showcase.json');
    const showcase = fs.existsSync(showcasePath) ? fs.readFileSync(showcasePath, 'utf8') : null;
    if (showcase && (Buffer.byteLength(showcase) > 256 * 1024 || ![1, 3].includes(JSON.parse(showcase).schemaVersion))) {
      throw Error('Invalid template showcase: ' + meta.id);
    }
    const files = {};
    function visit(dir, prefix='') {
      for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
        if (entry.name.startsWith('.') || /^(tests?|saved|node_modules)$/i.test(entry.name)) continue;
        const relative=prefix+entry.name;
        if (entry.isDirectory()) visit(path.join(dir,entry.name),relative+'/');
        else if(entry.isFile() && !['metadata.json', 'showcase.json'].includes(relative) && !/readme|validation/i.test(entry.name) && /\.(godot|tscn|gd|tres|svg|json|cfg|txt|gdshader)$/.test(entry.name)) files[relative]=fs.readFileSync(path.join(dir,entry.name),'utf8');
      }
    }
    visit(base);
    if (!files['project.godot'] || !files['scenes/main.tscn']) throw Error('Template must have project.godot and scenes/main.tscn: '+meta.id);
    const assetPaths=meta.assetPaths||[];
    for (const asset of assetPaths) if(!Object.hasOwn(files,asset)) throw Error('Missing bundled template asset: '+asset);
    result[meta.id]=Object.freeze({...meta,assetPaths,showcase,files:Object.freeze(files)});
  }
  return result;
}
module.exports={loadGameTemplates, loadAssetStore, MAIN_SCENE_PATH, showcaseSceneFiles, showcaseStagedFiles};
