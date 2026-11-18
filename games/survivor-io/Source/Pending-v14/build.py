"""Offline build. JSON reference subset + explicit design balance are compiled into HTML."""
from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parent
s=(r/'src/template.html').read_text(encoding='utf-8')
manifest='const REFERENCE_DB='+json.dumps(json.loads((r/'data/reference_subset.json').read_text()),ensure_ascii=False)+';\nconst REF_BALANCE='+json.dumps(json.loads((r/'data/runtime_balance.json').read_text()),ensure_ascii=False)+';'
s=s.replace('/*__MANIFEST__*/',manifest)
for tag,name in [('UI','ui.css'),('REFERENCE_CSS','reference.css'),('DATA','data.js'),('GAMEPLAY','gameplay.js'),('TACTICS','tactics.js'),('DOCTRINE','doctrine.js'),('PERSISTENCE','persistence.js'),('LEGACY','legacy2d.js'),('RENDERER','render3d.js'),('ENHANCEMENTS','enhancements.js'),('REFERENCE','reference.js'),('INPUT','input.js')]:
 s=s.replace('/*__'+tag+'__*/',(r/'src'/name).read_text(encoding='utf-8'))
assert '/*__' not in s
(r/'index.html').write_text(s,encoding='utf-8')
print('Built index.html:',len(s.encode()),'bytes')
