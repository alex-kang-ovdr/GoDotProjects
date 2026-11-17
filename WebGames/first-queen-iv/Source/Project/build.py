"""Rebuild the self-contained index.html. No third-party packages required."""
from pathlib import Path
root = Path(__file__).resolve().parent
html = (root / 'src' / 'layout.html').read_text(encoding='utf-8')
for marker, filename in [('STYLE', 'style.css'), ('ENGINE', 'engine.js'), ('RENDERER', 'renderer.js'), ('UI', 'ui.js')]:
    html = html.replace('/*' + marker + '*/', (root / 'src' / filename).read_text(encoding='utf-8'))
(root / 'index.html').write_text(html, encoding='utf-8')
print(f'Built index.html: {len(html.encode("utf-8")):,} bytes')
