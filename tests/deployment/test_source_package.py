import importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('source_packager',ROOT/'tools/build/package_source.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class SourcePackageTests(unittest.TestCase):
 def test_source_manifest_and_private_runtime_exclusions(self):
  with tempfile.TemporaryDirectory(prefix='playhub-package-test-') as tmp:
   root=Path(tmp)/'root';root.mkdir()
   contents={'apps/hub/server/index.mjs':'export {};','apps/forge/server.cjs':'module.exports={};','games/demo/index.html':'<h1>test</h1>',
    'apps/hub/config/local.json':'secret','apps/hub/config/example.json':'{}','apps/forge/node_modules/a/index.js':'x',
    'apps/forge/Saved/private.json':'x','apps/forge/.env':'SECRET=x','engine/godot/Godot.exe':'binary','apps/forge/OfficialGodot/vendor/godot.editor.js':'engine',
    'apps/hub/data/database.sqlite':'private','docs/README.md':'source'}
   for name,text in contents.items():p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
   out=Path(tmp)/'output.zip';result=mod.package(root,out,'test-1');self.assertEqual(result['artifactType'],'source-only')
   with zipfile.ZipFile(out) as z:
    names=set(z.namelist());self.assertIn('games/demo/index.html',names);self.assertIn('apps/hub/config/example.json',names)
    for n in contents:
     if any(x in n for x in ['local.json','node_modules','Saved','.env','Godot.exe','vendor','database.sqlite']):self.assertNotIn(n,names)
    m=json.loads(z.read('SOURCE_MANIFEST.json'));self.assertFalse(m['runnableBundle']);self.assertFalse(m['engineBinariesIncluded']);self.assertTrue(m['components']['hub']['entryPresent'])
    self.assertTrue(all(len(r['sha256'])==64 for r in m['files']))
   with self.assertRaises(FileExistsError):mod.package(root,out,'test-1')
 def test_detected_credential_stops_package(self):
  with tempfile.TemporaryDirectory(prefix='playhub-package-test-') as tmp:
   root=Path(tmp)/'root';(root/'apps/hub').mkdir(parents=True);(root/'apps/hub/key.txt').write_text('-----BEGIN '+'PRIVATE KEY-----')
   out=Path(tmp)/'out.zip'
   with self.assertRaises(ValueError):mod.package(root,out,'test-1')
   self.assertFalse(out.exists())
 def test_source_files_do_not_make_missing_engine_runnable(self):
  with tempfile.TemporaryDirectory(prefix='playhub-package-test-') as tmp:
   root=Path(tmp)/'root';(root/'engine/godot').mkdir(parents=True);(root/'engine/godot/README.md').write_text('placeholder')
   result=mod.package(root,Path(tmp)/'out.zip','source');self.assertEqual(result['components']['engine']['status'],'not-included')
 def test_component_archives_are_separate_and_engine_fails(self):
  with tempfile.TemporaryDirectory(prefix='playhub-package-test-') as tmp:
   root=Path(tmp)/'root'
   for name in ['apps/hub/server/index.mjs','apps/forge/server.cjs','games/demo/index.html']:
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('source')
   out=Path(tmp)/'hub.zip';mod.package(root,out,'v1','hub')
   with zipfile.ZipFile(out) as z:
    self.assertIn('apps/hub/server/index.mjs',z.namelist());self.assertNotIn('apps/forge/server.cjs',z.namelist());self.assertNotIn('games/demo/index.html',z.namelist())
   with self.assertRaises(ValueError):mod.package(root,Path(tmp)/'engine.zip','v1','engine')
 def test_source_design_data_and_packager_are_included_but_runtime_data_is_not(self):
  with tempfile.TemporaryDirectory(prefix='playhub-package-test-') as tmp:
   root=Path(tmp)/'root'
   included=['games/demo/Source/Data/design.csv','games/demo/Source/Data/README.md','games/demo/Source/Data/balance.xlsx','tools/build/package_source.py','tools/build/Build_Source_Zip.bat']
   excluded=['data/account.json','apps/hub/data/account.json','games/demo/data/player.json','games/demo/Source/Data/data/private.json','games/demo/Source/Data/build/generated.js','apps/forge/build/output.js','tools/other/build/output.js']
   for name in included+excluded:
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'source fixture')
   out=Path(tmp)/'game.zip';mod.package(root,out,'corrected','game')
   with zipfile.ZipFile(out) as z:
    names=set(z.namelist())
    for name in included:self.assertIn(name,names)
    for name in excluded:self.assertNotIn(name,names)
    manifest=json.loads(z.read('SOURCE_MANIFEST.json'))
    self.assertEqual({r['path'] for r in manifest['files']},set(included))
if __name__=='__main__':unittest.main()
