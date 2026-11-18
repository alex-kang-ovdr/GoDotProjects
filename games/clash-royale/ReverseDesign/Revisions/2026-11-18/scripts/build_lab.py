"""Build the self-contained offline research HTML. Python standard library only.

Input JSON stays unchanged. No network, npm, or browser bundler is needed.
Run after analyze_quality.py and validate.py; --check detects a stale bundle.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def dataset():
    return {
        'package': {'version': '4.0.0', 'analysis_as_of': '2026-11-17',
                    'original_client_executed': False,
                    'scope': 'versioned_public_evidence_with_reference_models'},
        'tables': {p.stem: read_json(p) for p in sorted((ROOT/'data/tables').glob('*.json'))},
        'sources': [r for p in sorted((ROOT/'data/sources').glob('*.json')) for r in read_json(p)],
        'analysis': {p.stem: read_json(p) for p in sorted((ROOT/'data/analysis').glob('*.json'))},
    }

def build():
    template = (ROOT/'lab/index.template.html').read_text(encoding='utf-8')
    value = json.dumps(dataset(), ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    # A JSON string containing HTML must never terminate its inert script element.
    value = value.replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    replacements = {
        '__DATA__': value,
        '/*__STYLE__*/': (ROOT/'lab/style.css').read_text(encoding='utf-8'),
        '/*__CORE__*/': (ROOT/'lab/core.js').read_text(encoding='utf-8'),
        '/*__ECONOMY__*/': (ROOT/'lab/economy.js').read_text(encoding='utf-8'),
        '/*__CONTRACTS__*/': (ROOT/'lab/contracts.js').read_text(encoding='utf-8'),
        '/*__APP__*/': (ROOT/'lab/app.js').read_text(encoding='utf-8'),
    }
    for marker, content in replacements.items():
        if template.count(marker) != 1:
            raise ValueError(f'Missing or duplicate template marker: {marker}')
        if marker not in ('__DATA__', '/*__STYLE__*/') and '</script' in content.lower():
            raise ValueError(f'Inline script closing tag in {marker}')
        template = template.replace(marker, content)
    return template.encode('utf-8')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args=parser.parse_args()
    content=build()
    path=ROOT/'ROYALE_DATA_LAB.html'
    if args.check:
        if not path.exists() or path.read_bytes()!=content:
            raise SystemExit('Offline HTML is stale. Run python scripts/build_lab.py')
    else:
        path.write_bytes(content)
    print(json.dumps({'mode':'check' if args.check else 'build','file':path.name,
                      'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()},ensure_ascii=False))

if __name__=='__main__':
    main()
