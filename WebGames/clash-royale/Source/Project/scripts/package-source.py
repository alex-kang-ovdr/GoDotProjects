"""Package the reproducible project without Git metadata or hosting identifiers."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
files = [root / "README.md", root / "package.json"]
for directory in ("dist", "scripts", "tests", "docs"):
    files.extend(p for p in (root / directory).rglob("*") if p.is_file() and p.name != "source.zip")
target = root / "dist" / "source.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        archive.write(path, "crownfall-arena/" + str(path.relative_to(root)))
with ZipFile(target) as archive:
    assert archive.testzip() is None
print(f"Source ZIP built: {target.stat().st_size:,} bytes, {len(files)} files.")
