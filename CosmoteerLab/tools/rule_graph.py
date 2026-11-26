"""Map literal external .rules references to their files and one-based source lines."""

import argparse
from collections import defaultdict
import json
from pathlib import Path
import posixpath

from extract_catalog import TOKEN


def references(source):
    line = 1
    for token in TOKEN.finditer(source):
        value = token[0]
        if value.startswith("<") and value.lower().endswith(".rules>"):
            yield value[1:-1], line
        line += value.count("\n")


def target_path(source, literal):
    if literal.startswith("./Data/"):
        return posixpath.normpath(literal[len("./Data/"):])
    return posixpath.normpath(posixpath.join(posixpath.dirname(source), literal))


def build_graph(data):
    paths = sorted((path.relative_to(data).as_posix() for path in data.rglob("*.rules") if path.is_file()))
    if not paths:
        raise ValueError(f"No .rules files found under {data}")
    # Retain the spelling on disk when a Windows installation uses different case.
    actual = {name.casefold(): name for name in paths}
    if len(actual) != len(paths):
        raise ValueError("Case-insensitive names collide in the source tree")
    files = {}
    missing = set()
    edges = occurrences = missing_edges = 0
    for source in paths:
        targets = defaultdict(list)
        for literal, line in references((data / source).read_text(encoding="utf-8-sig")):
            path = target_path(source, literal)
            target = actual.get(path.casefold(), path)
            targets[target].append(line)
            occurrences += 1
        for target in targets:
            if target.casefold() not in actual:
                missing.add(target)
                missing_edges += 1
        files[source] = dict(sorted(targets.items()))
        edges += len(targets)
    summary = {"files": len(paths), "edges": edges, "occurrences": occurrences,
               "missing_targets": len(missing), "missing_edges": missing_edges}
    return {"schema_version": 1, "summary": summary, "missing_targets": sorted(missing), "files": files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=Path, help="local Cosmoteer/Data directory")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data/rule_graph.json")
    args = parser.parse_args()
    graph = build_graph(args.data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(graph, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(graph["summary"]))


if __name__ == "__main__":
    main()
