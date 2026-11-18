"""Rebuild the OFL Korean font subset used by the text-only Forge catalog.

Usage: python Tools/prepare-fortress-font.py /path/to/NanumGothic-Regular.ttf
Requires fonttools. The original font and OFL license are from
https://github.com/google/fonts/tree/main/ofl/nanumgothic
The derivative is renamed Fortress UI to respect reserved font names.
"""
import base64
import io
import pathlib
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

root = pathlib.Path(__file__).resolve().parents[1] / "Templates" / "fortress-war"
text = "".join(p.read_text(encoding="utf-8") for folder in ("scripts", "data")
               for p in (root / folder).rglob("*") if p.is_file() and p.suffix in (".gd", ".json"))
unicodes = set(map(ord, text)) | set(range(32, 127))
font = TTFont(sys.argv[1])
options = subset.Options()
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
names = {1: "Fortress UI", 2: "Regular", 3: "Fortress UI Regular 1.0",
         4: "Fortress UI Regular", 6: "FortressUI-Regular", 16: "Fortress UI", 17: "Regular"}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
buffer = io.BytesIO()
font.save(buffer)
output = root / "fonts" / "fortress-ui.txt"
output.write_text(base64.b64encode(buffer.getvalue()).decode("ascii") + "\n", encoding="ascii")
print(f"{output}: {output.stat().st_size} bytes; {len(unicodes)} requested codepoints")
