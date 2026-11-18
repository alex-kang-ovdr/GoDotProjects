"""Parse the static template and load its local dataset for Node UI tests.

This does not render HTML or launch a browser. It uses only Python stdlib.
"""
from html.parser import HTMLParser
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_lab import dataset


class TreeParser(HTMLParser):
    VOID = set("area base br col embed hr img input link meta param source track wbr".split())

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "#document", "children": []}
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        item = {"tag": tag, "attrs": {k: v if v is not None else "" for k, v in attrs}, "children": []}
        self.stack[-1]["children"].append(item)
        if tag not in self.VOID:
            self.stack.append(item)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                return
        raise ValueError(f"Unmatched closing tag: {tag}")

    def handle_data(self, data):
        self.stack[-1]["children"].append({"text": data})


if __name__ == "__main__":
    parser = TreeParser()
    parser.feed((ROOT / "lab/index.template.html").read_text(encoding="utf-8"))
    parser.close()
    if len(parser.stack) != 1:
        raise SystemExit("Unclosed template tags")
    print(json.dumps({"tree": parser.root, "data": dataset()}, ensure_ascii=False, allow_nan=False))
