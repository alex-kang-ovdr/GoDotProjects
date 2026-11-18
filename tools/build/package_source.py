"""Source-only archive: no runtime, user data, credentials or engine payloads."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,re,zipfile
ROOT=Path(__file__).resolve().parents[2]
ROOTS={'apps','games','engine','docs','tools','tests'}
ROOT_FILES={'readme.md','license','package.json','package-lock.json','.gitignore','agents.md'}
EXCLUDED_DIRS={'.git','node_modules','saved','data','storage','logs','runtime','dist','build','coverage','__pycache__','.cache','.codex','.overdare','.overdare-dev','.next','test-results','playwright-report','sessions','backups','artifacts'}
EXCLUDED_NAMES={'local.json','auth.json','credentials.json','token.json','tokens.json','secrets.json','desktop.ini'}
EXTENSIONS={'.cjs','.mjs','.js','.ts','.tsx','.jsx','.html','.css','.json','.md','.txt','.bat','.cmd','.ps1','.py','.gd','.godot','.tscn','.tres','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.mp3','.wav','.ogg','.csv','.xlsx','.yml','.yaml','.toml','.lock','.glb','.gltf','.bin','.ttf','.woff','.woff2'}
SECRET=re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}')
def allowed_directory(relative):
    lower=[x.lower() for x in relative.parts]
    for i,name in enumerate(lower):
        if name.startswith('.'):
            return False
        if name in EXCLUDED_DIRS:
            # Exact source-only exceptions, not a blanket allowance for data/build.
            if name=='build' and lower[:i+1]==['tools','build']:
                continue
            if name=='data' and i==3 and lower[0]=='games' and lower[2]=='source':
                continue
            return False
    return True

def allowed(relative):
    parts=relative.parts;lower=[x.lower() for x in parts];name=lower[-1]
    if not allowed_directory(relative.parent):return False
    if name in EXCLUDED_NAMES or name.startswith('.env') or name.endswith(('.pem','.key','.pfx','.p12','.sqlite','.sqlite3','.db','.log','.zip','.7z','.exe','.dll','.wasm','.pck','.pak','.uasset','.umap','.ovdrjm','.ovdrm','.map')):return False
    if len(parts)==1:return name in ROOT_FILES
    if lower[0] not in ROOTS:return False
    if 'config' in lower[:-1] and name.endswith('.json') and 'example' not in name:return False
    if 'officialgodot' in lower and 'vendor' in lower:return False
    return relative.suffix.lower() in EXTENSIONS or name=='license'
def component(relative):
    p=relative.parts
    if len(p)>1 and p[0].lower()=='apps':return p[1].lower()
    return {'games':'game','engine':'engine'}.get(p[0].lower(),'tooling')
def package(root,output,version,scope="all"):
    root=Path(root).resolve();output=Path(output).resolve()
    if scope not in {'all','hub','forge','game','engine'}:raise ValueError('Invalid component scope')
    if scope=='engine':raise ValueError('Standalone Godot engine package is absent; cannot fabricate an engine artifact')
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}',version):raise ValueError('Invalid source version')
    if output.exists():raise FileExistsError('Refusing to overwrite an existing artifact')
    if output.suffix.lower()!='.zip':raise ValueError('Output must be a ZIP')
    paths=[];excluded=0
    for current,dirs,names in os.walk(root,followlinks=False):
        base=Path(current);dirs[:]=sorted(d for d in dirs if allowed_directory((base/d).relative_to(root)) and not (base/d).is_symlink())
        for name in sorted(names):
            file=base/name;relative=file.relative_to(root)
            if file.is_symlink() or not allowed(relative):excluded+=1;continue
            kind=component(relative)
            if scope!='all' and kind not in {scope,'tooling'}:excluded+=1;continue
            if file.resolve()==output:continue
            paths.append((file,relative))
    if len(paths)>100000:raise ValueError('Source file count exceeds packaging limit')
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary=output.with_name(output.name+'.'+os.urandom(8).hex()+'.tmp')
    records=[];total=0
    try:
        with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
            for file,relative in sorted(paths,key=lambda x:x[1].as_posix()):
                if file.stat().st_size>100*1024*1024:raise ValueError('Oversize source asset: '+relative.as_posix())
                content=file.read_bytes();total+=len(content)
                if total>3*1024*1024*1024:raise ValueError('Archive source exceeds size limit')
                if file.suffix.lower() in {'.json','.js','.cjs','.mjs','.ts','.txt','.md','.yml','.yaml','.toml','.py','.ps1','.bat','.cmd'} and SECRET.search(content):raise ValueError('Possible credential material; packaging stopped: '+relative.as_posix())
                name=relative.as_posix();archive.writestr(name,content)
                records.append({'path':name,'component':component(relative),'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
            source_paths={x['path'] for x in records}
            manifest={'schemaVersion':1,'artifactType':'source-only','componentScope':scope,'version':version,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'runnableBundle':False,'engineBinariesIncluded':False,'userDataIncluded':False,'excludedFileCount':excluded,
              'components':{'hub':{'entryPresent':'apps/hub/server/index.mjs' in source_paths,'nodeMinimum':24,'runtimeVerified':False},
                'forge':{'entryPresent':'apps/forge/server.cjs' in source_paths,'nodeMinimum':22,'runtimeVerified':False},
                'game':{'htmlFiles':sum(1 for x in records if x['component']=='game' and x['path'].endswith('.html')),'runtimeVerified':False},
                'engine':{'status':'not-included','runtimeVerified':False}},'fileCount':len(records),'totalSourceBytes':total,'files':records}
            archive.writestr('SOURCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
            archive.writestr('SOURCE_ONLY.txt','SOURCE ONLY. Not a runnable deployment. Node, dependencies, private operator configuration, native Godot and browser engine payloads are not included. Hub/Forge/Game paths and independent operation require verification.\n')
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:raise ValueError('ZIP CRC verification failed')
            for row in records:
                if hashlib.sha256(archive.read(row['path'])).hexdigest()!=row['sha256']:raise ValueError('ZIP hash verification failed')
        os.replace(temporary,output)
    finally:
        if temporary.exists():temporary.unlink()
    return {'path':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'artifactType':'source-only','componentScope':scope,'files':len(records),'bytes':output.stat().st_size,'components':manifest['components']}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--output',type=Path,required=True);p.add_argument('--version',required=True);p.add_argument('--component',choices=['all','hub','forge','game','engine'],default='all');args=p.parse_args()
    print(json.dumps(package(args.root,args.output,args.version,args.component),ensure_ascii=False,indent=2))
