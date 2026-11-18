"""Build a standalone HTML file from the readable source modules. Python stdlib only."""
from pathlib import Path
root = Path(__file__).resolve().parent
src = root / 'src'
html = (src / 'template.html').read_text(encoding='utf-8')
for token, file in [('STYLE','style.css'),('CORE','core.js'),('GAME','game.js'),('RENDERER','renderer.js'),('SCENE','scene.js'),('APP','app.js')]:
    html = html.replace('/*__'+token+'__*/', (src/file).read_text(encoding='utf-8'))
(root/'index.html').write_text(html, encoding='utf-8')
print(f'Built {root / "index.html"}: {len(html.encode("utf-8")):,} bytes')
