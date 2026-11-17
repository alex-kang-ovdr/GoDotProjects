#!/usr/bin/env python3
"""Build a self-contained playable HTML and a portable source ZIP. No dependencies."""
from pathlib import Path
import zipfile
import re
ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
html = (DIST / "index.html").read_text(encoding="utf-8")
css = (DIST / "styles.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
for name in ("engine.js", "renderer.js", "app.js"):
    script = (DIST / name).read_text(encoding="utf-8")
    script = script.replace("</script", "<\\/script")
    html = html.replace('<script src="' + name + '"></script>', '<script>\n' + script + '\n</script>')
# A standalone file must not expose downloads of absent sibling files.
html = re.sub(r'<a\b[^>]*href="Brawl_Lab_(?:Offline\.html|Source\.zip)"[^>]*>.*?</a>', "", html, flags=re.S)
(DIST / "Brawl_Lab_Offline.html").write_text(html, encoding="utf-8")
paths = [ROOT / "README.md", ROOT / "CONTRACT.md", ROOT / "scripts/package.py"]
paths += sorted((ROOT / "tests").glob("*.cjs"))
paths += sorted((ROOT / "docs").glob("*.md")) if (ROOT / "docs").exists() else []
paths += [DIST / name for name in ("index.html", "styles.css", "engine.js", "renderer.js", "app.js", "Brawl_Lab_Offline.html")]
archive = DIST / "Brawl_Lab_Source.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for path in paths:
        z.write(path, Path("Brawl_Lab_Source") / path.relative_to(ROOT))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for path in paths:
        assert z.read(str(Path("Brawl_Lab_Source") / path.relative_to(ROOT))) == path.read_bytes()
print("Created", DIST / "Brawl_Lab_Offline.html")
print("Created", archive)
print("Source files:", len(paths))
