'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PlatformStore}=require('../Tools/platform-store.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');
const { spawnSync } = require('node:child_process');
const root=path.resolve(__dirname,'..');
test('game templates bundle assets before guided editor startup and preserve ready projects',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'playforge-template-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));const store=new PlatformStore(root,tmp);
 for(const id of ['tappy-chicken','iron-wood','brawllabs']){
  const template=store.getTemplate(id);assert.ok(template.assetPaths.length>0,id);
  const ready=store.createProject({name:'Prepared '+id,template:id});
  const guided=store.createProject({name:'Build '+id,template:id,mode:'guided'});
  for(const file of template.assetPaths){assert.equal(guided.files[file],template.files[file],file);assert.equal(ready.files[file],template.files[file]);assert.ok(!/\.(gd|tscn|godot)$/.test(file),'Assets cannot hide game code/scene creation');}
  assert.match(guided.files['scenes/main.tscn'],template.dimension==='2d'?/Node2D/:/Node3D/);
  assert.ok(Object.keys(ready.files).some(f=>f.endsWith('.gd')));
  assert.equal(Object.keys(guided.files).filter(f=>f.endsWith('.gd')).length,0,'game scripts are assembled during walkthrough');
  assert.match(ready.files['project.godot'],/run\/main_scene="res:\/\/scenes\/main.tscn"/);
  assert.ok(Object.keys(ready.files).every(f=>!f.startsWith('tests/')&&!f.includes('.godot/')));
 }
 assert.throws(()=>store.createProject({name:'bad',template:'iron-wood',mode:'unknown'}));
});

const engine = NativeRuntime.availability(root);
test('Tappy Chicken ready project plays, scores, crashes and keeps the best on retry', {
  skip: engine.available ? false : engine.error || 'Godot editor unavailable',
}, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-tappy-game-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const project = path.join(temp, 'project');
  const store = new PlatformStore(root, path.join(temp, 'store'));
  const { files } = store.createProject({ name: 'Tappy regression', template: 'tappy-chicken', mode: 'ready' });
  for (const [relative, source] of Object.entries(files)) {
    const output = path.join(project, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, source);
  }
  fs.copyFileSync(path.join(__dirname, 'fixtures/tappy-template-game.gd'), path.join(project, 'probe.gd'));
  const evidence = path.join(root, 'Saved/Tests/game-templates');
  fs.mkdirSync(evidence, { recursive: true });
  // Keep the real player's best score and editor settings outside the probe.
  const env = { ...process.env, APPDATA: temp, LOCALAPPDATA: temp, HOME: temp,
    XDG_DATA_HOME: temp, XDG_CONFIG_HOME: temp, XDG_CACHE_HOME: temp };
  function run(args, label) {
    const result = spawnSync(engine.executable, ['--headless', '--path', project, ...args], {
      env, encoding: 'utf8', timeout: 45000, windowsHide: true,
    });
    const log = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(path.join(evidence, `tappy-chicken-regression-${label}.log`), log);
    assert.ifError(result.error);
    assert.equal(result.status, 0, log);
    assert.doesNotMatch(log, /ERROR:|WARNING:|Assertion failed/);
    return log;
  }
  run(['--editor', '--import'], 'import');
  assert.match(run(['--script', 'res://probe.gd'], 'play'), /TAPPY_GAME_OK/);
});
