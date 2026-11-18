"""Optional network step: reproduce the pinned factual subset, not a live update.

python scripts/fetch_snapshot.py
python scripts/fetch_snapshot.py --from-cache /path/to/previous/downloads
"""
import argparse
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from dataset_config import ROOT, INPUTS, AS_OF, ARCHIVE_DATE, ARCHIVE_COMMIT, SNAPSHOT_ID, public_url, fact_subset

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-cache', type=Path)
    args = parser.parse_args()
    output = ROOT / 'data/raw'
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    # Verify ALL hashes before changing any deliverable.
    pending = []
    for name, (filename, expected_hash) in INPUTS.items():
        if args.from_cache:
            raw = (args.from_cache / (name + '.json')).read_bytes()
        else:
            req = urllib.request.Request(public_url(filename), headers={'User-Agent': 'CR-Reconstruction/2.0'})
            with urllib.request.urlopen(req, timeout=40) as response:
                raw = response.read()
        actual_hash = hashlib.sha256(raw).hexdigest()
        if actual_hash != expected_hash:
            raise ValueError(f'{filename}: archive hash mismatch; no output replaced')
        data = fact_subset(name, json.loads(raw))
        selected = (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode()
        path = output / (name + '_2023_facts.json')
        pending.append((path, selected))
        entries.append({'name': name, 'upstream_url': public_url(filename),
                        'original_sha256': actual_hash, 'original_bytes': len(raw),
                        'local_path': str(path.relative_to(ROOT)),
                        'selected_sha256': hashlib.sha256(selected).hexdigest(),
                        'rows': {k: len(v) for k, v in data.items()} if isinstance(data, dict) else len(data)})
    for path, selected in pending:
        path.write_bytes(selected)
    manifest = {'schema_version': 1, 'snapshot_id': SNAPSHOT_ID,
                'analysis_as_of': AS_OF,
                'retrieved_at_utc': datetime.now(timezone.utc).isoformat(),
                'upstream_commit': ARCHIVE_COMMIT,
                'upstream_commit_date': ARCHIVE_DATE, 'scope': 'historical_public_dataset',
                'is_current_live_client': False, 'full_original_files_redistributed': False,
                'inputs': entries}
    (ROOT / 'data/snapshot_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'snapshot': SNAPSHOT_ID, 'inputs': len(entries), 'verified': True}))

if __name__ == '__main__':
    main()
