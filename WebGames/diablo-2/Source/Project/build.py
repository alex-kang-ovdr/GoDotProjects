#!/usr/bin/env python3
"""Rebuild the offline single HTML; Python 3 standard library only."""
from pathlib import Path
root=Path(__file__).resolve().parent
modules=['core','generator','gear','navigation','simulation','persistence','render','ui','boot']
js="(()=>{'use strict';\n"+'\n'.join((root/'src'/f'{m}.js').read_text(encoding='utf-8') for m in modules)+"\n})();"
css=(root/'src/style.css').read_text(encoding='utf-8')
html=(root/'src/shell.html').read_text(encoding='utf-8').replace('/*STYLE*/',css).replace('/*SCRIPT*/',js)
(root/'index.html').write_text(html,encoding='utf-8')
print(f'Built {root / "index.html"} ({len(html.encode("utf-8")):,} bytes)')
