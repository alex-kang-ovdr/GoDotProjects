#!/usr/bin/env python3
"""Regenerate UTF-8-BOM CSV views from the authoritative package JSON files."""
import csv
import json
from pathlib import Path


def csv_cell(value):
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def write_table(path, rows):
    fields = list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: csv_cell(row.get(key)) for key in fields})


def main():
    data = Path(__file__).resolve().parent.parent / 'data'
    generated = []
    for source in sorted(data.glob('*.json')):
        rows = json.loads(source.read_text(encoding='utf-8'))
        if isinstance(rows, list) and all(isinstance(row, dict) for row in rows):
            target = source.with_suffix('.csv')
            write_table(target, rows)
            generated.append((target.name, len(rows)))
    snapshot = json.loads((data / 'ironwood_v4_snapshot.json').read_text(encoding='utf-8'))
    for key in ('parts', 'missions', 'constants'):
        target = data / f'ironwood_v4_{key}.csv'
        write_table(target, snapshot[key])
        generated.append((target.name, len(snapshot[key])))
    print(json.dumps({'generated': generated}, ensure_ascii=False))


if __name__ == '__main__':
    main()
