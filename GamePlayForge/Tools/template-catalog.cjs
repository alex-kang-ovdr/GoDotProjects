'use strict';
const fs = require('node:fs');
const path = require('node:path');
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
    const files = {};
    function visit(dir, prefix='') {
      for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
        if (entry.name.startsWith('.') || /^(tests?|saved|node_modules)$/i.test(entry.name)) continue;
        const relative=prefix+entry.name;
        if (entry.isDirectory()) visit(path.join(dir,entry.name),relative+'/');
        else if(entry.isFile() && relative!=='metadata.json' && !/readme|validation/i.test(entry.name) && /\.(godot|tscn|gd|tres|svg|json|cfg|txt|gdshader)$/.test(entry.name)) files[relative]=fs.readFileSync(path.join(dir,entry.name),'utf8');
      }
    }
    visit(base);
    if (!files['project.godot'] || !files['scenes/main.tscn']) throw Error('Template must have project.godot and scenes/main.tscn: '+meta.id);
    const assetPaths=meta.assetPaths||[];
    for (const asset of assetPaths) if(!Object.hasOwn(files,asset)) throw Error('Missing bundled template asset: '+asset);
    result[meta.id]=Object.freeze({...meta,assetPaths,files:Object.freeze(files)});
  }
  return result;
}
module.exports={loadGameTemplates};
