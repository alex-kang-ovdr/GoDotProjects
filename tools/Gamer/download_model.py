"""Download the pinned public checkpoint; verify LFS sizes and SHA-256 hashes."""
import hashlib
import json
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent
REPO = 'THUSI-Lab/GameScaling-0.8B-S3'
REVISION = 'e41159614185e16130d3eadba8a0e865ccf24f33'
DEST = ROOT / 'models' / 'GameScaling-0.8B-S3'

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    response = requests.get(f'https://huggingface.co/api/models/{REPO}/revision/{REVISION}?blobs=true', timeout=60)
    response.raise_for_status()
    meta = response.json()
    if meta['sha'] != REVISION:
        raise RuntimeError('Model revision mismatch')
    records = []
    for item in meta['siblings']:
        name = item['rfilename']
        if '/' in name or not (name.endswith(('.json', '.jinja', '.safetensors')) or name in ('LICENSE', 'README.md')):
            continue
        target = DEST / name
        expected = item.get('lfs', {}).get('sha256')
        expected_size = item.get('size', item.get('lfs', {}).get('size'))
        if target.exists():
            digest = hashlib.file_digest(target.open('rb'), 'sha256').hexdigest()
            if expected and digest == expected:
                print(f'verified existing {name}', flush=True)
                records.append({'file': name, 'bytes': target.stat().st_size, 'sha256': digest})
                continue
        partial = target.with_suffix(target.suffix + '.part')
        digest = hashlib.sha256()
        size = 0
        print(f'downloading {name} ({expected_size} bytes)', flush=True)
        with requests.get(f'https://huggingface.co/{REPO}/resolve/{REVISION}/{name}', stream=True, timeout=(30, 180)) as stream:
            stream.raise_for_status()
            with partial.open('wb') as output:
                for block in stream.iter_content(4 * 1024 * 1024):
                    output.write(block)
                    digest.update(block)
                    size += len(block)
        if expected_size is not None and size != expected_size:
            raise RuntimeError(f'Size mismatch: {name}')
        if expected and digest.hexdigest() != expected:
            raise RuntimeError(f'SHA256 mismatch: {name}')
        partial.replace(target)
        records.append({'file': name, 'bytes': size, 'sha256': digest.hexdigest()})
    (DEST / 'download-manifest.json').write_text(json.dumps({'repo': REPO, 'revision': REVISION, 'files': records}, indent=2), encoding='utf-8')
    print('Checkpoint verified and ready', flush=True)

if __name__ == '__main__':
    main()
