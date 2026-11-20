#!/usr/bin/env python3
"""Bundle the game into one portable, offline HTML file using only Python stdlib."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
shell = (root / 'src/shell.html').read_text(encoding='utf-8')
css = (root / 'src/style.css').read_text(encoding='utf-8')
scripts = ['data.js', 'engine.js', 'camera.js', 'picking.js', 'checkpoint.js', 'progress.js', 'render.js', 'atlas.js', 'app.js']
js = '\n;\n'.join((root / 'src' / name).read_text(encoding='utf-8') for name in scripts)
assert '</script' not in js.lower(), 'Inline script terminator in source'
html = shell.replace('@@CSS@@', css).replace('@@JS@@', js)
assert '@@' not in html, 'Unresolved template marker'
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/index.html').write_text(html, encoding='utf-8')
print(f'Built dist/index.html · {len(html.encode("utf-8")):,} bytes · no network dependencies')
