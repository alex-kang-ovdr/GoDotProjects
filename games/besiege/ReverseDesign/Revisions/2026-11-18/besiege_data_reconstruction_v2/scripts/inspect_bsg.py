#!/usr/bin/env python3
"""Read-only generic XML inspection. This is not a verified Besiege importer."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

MAX_BYTES = 8 * 1024 * 1024
MAX_ELEMENTS = 200_000


def local_name(tag):
    return str(tag).rsplit('}', 1)[-1]


def inspect(path, limit=5000):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Input exceeds the 8 MiB inspection limit.')
    raw = path.read_bytes()
    # Covers XML ASCII-compatible encodings and zero-padded UTF-16/32 markup.
    compact = raw.replace(b'\x00', b'').upper()
    if b'<!DOCTYPE' in compact or b'<!ENTITY' in compact:
        raise ValueError('DTD/entity declarations are not accepted.')
    tree = ET.fromstring(raw)
    stack = [(tree, '/' + local_name(tree.tag) + '[1]')]
    tags, leaves, attributes = {}, [], []
    total = block_like = 0
    truncated = False
    while stack:
        node, locator = stack.pop()
        total += 1
        if total > MAX_ELEMENTS:
            raise ValueError('Element count exceeds inspection limit.')
        name = local_name(node.tag)
        tags[name] = tags.get(name, 0) + 1
        if name.casefold() == 'block':
            block_like += 1
        if node.attrib:
            if len(attributes) < limit:
                attributes.append({'path': locator, 'values': dict(node.attrib)})
            else:
                truncated = True
        children = list(node)
        text = (node.text or '').strip()
        if not children and text:
            if len(leaves) < limit:
                leaves.append({'path': locator, 'text': text})
            else:
                truncated = True
        indexed, occurrences = [], {}
        for child in children:
            child_name = local_name(child.tag)
            occurrences[child_name] = occurrences.get(child_name, 0) + 1
            indexed.append((child, f'{locator}/{child_name}[{occurrences[child_name]}]'))
        stack.extend(reversed(indexed))
    return {
        'format': 'generic_xml_inspection', 'schema_version': 1,
        'source_file': path.name, 'size_bytes': len(raw),
        'sha256': hashlib.sha256(raw).hexdigest(), 'xml_root': local_name(tree.tag),
        'total_elements': total, 'tag_counts': dict(sorted(tags.items())),
        'block_like_elements': block_like,
        'attributes': attributes, 'leaf_parameters': leaves,
        'truncated': truncated, 'per_list_limit': limit,
        'verified_besiege_importer': False,
        'notes': [
            'No input file was modified and no game was executed.',
            'Block-like elements are XML name matches, not a verified game part count.',
            'Leaf values remain text; no physics constants or default values were inferred.'
        ]
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--limit', type=int, default=5000)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100000:
        parser.error('--limit must be between 1 and 100000')
    try:
        source = args.input.resolve(strict=True)
        if args.out and args.out.resolve() == source:
            raise ValueError('Output must not replace the input file.')
        result = inspect(source, args.limit)
        serialized = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        if args.out:
            # Exclusive create intentionally preserves an existing inspection output.
            with args.out.open('x', encoding='utf-8') as out:
                out.write(serialized)
            print(args.out)
        else:
            print(serialized, end='')
    except (OSError, ValueError, ET.ParseError) as exc:
        print(f'Inspection failed: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
