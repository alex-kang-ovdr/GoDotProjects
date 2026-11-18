"""Build the offline, single-file game. Python standard library only."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
parts=['engine.js','logic.js','data.js','gameplay-data.js','gameplay.js','mission-data.js','mission.js','perception.js','world.js','motion.js','models.js','gameplay-integration.js','main.js']
code='\n'.join((ROOT/'src'/p).read_text(encoding='utf-8') for p in parts)
# Protect script termination if future content introduces an HTML closing tag.
code=code.replace('</script',r'<\/script')
html=(ROOT/'src/template.html').read_text(encoding='utf-8')
html=html.replace('/*__STYLE__*/',(ROOT/'src/style.css').read_text(encoding='utf-8')).replace('/*__CODE__*/',code)
(ROOT/'index.html').write_text(html,encoding='utf-8')
print(f'Built {ROOT / "index.html"}: {len(html.encode()):,} bytes. No CDN, fetch, modules or runtime dependencies.')
