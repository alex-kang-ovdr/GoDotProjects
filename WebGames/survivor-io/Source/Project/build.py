"""Build a fully offline, single-file game. Python is only needed for rebuilding."""
from pathlib import Path
r=Path(__file__).resolve().parent
s=(r/'src/template.html').read_text(encoding='utf-8')
for tag,name in [('UI','ui.css'),('DATA','data.js'),('GAMEPLAY','gameplay.js'),('TACTICS','tactics.js'),('DOCTRINE','doctrine.js'),('PERSISTENCE','persistence.js'),('LEGACY','legacy2d.js'),('RENDERER','render3d.js'),('ENHANCEMENTS','enhancements.js'),('INPUT','input.js')]:
    s=s.replace('/*__'+tag+'__*/',(r/'src'/name).read_text(encoding='utf-8'))
assert '/*__' not in s
(r/'index.html').write_text(s,encoding='utf-8')
print('Built index.html:',len(s.encode()),'bytes')
