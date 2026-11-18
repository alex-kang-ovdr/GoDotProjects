"""Create the v4 ZIP with file hashes and verify every archived byte.

Run verify_package.py first. Output defaults outside the source folder.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def files():
    return sorted(p for p in ROOT.rglob('*') if p.is_file() and
                  '__pycache__' not in p.parts and not any(part.startswith('.') for part in p.relative_to(ROOT).parts) and
                  p.suffix not in ('.pyc','.zip','.tmp','.log'))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT.parent/'Clash_Royale_Reverse_Design_Reconstructed_v4.zip')
    args=parser.parse_args()
    output=args.output.resolve()
    if output==ROOT or ROOT in output.parents:
        raise SystemExit('Choose an output ZIP outside the source directory.')
    report=json.loads((ROOT/'reports/release_validation.json').read_text(encoding='utf-8'))
    if report.get('status')!='passed':raise SystemExit('Package verification must pass before packaging.')
    manifest=ROOT/'SHA256SUMS.txt'
    rows=[f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(ROOT).as_posix()}' for p in files() if p!=manifest]
    manifest.write_text('\n'.join(rows)+'\n',encoding='utf-8')
    selected=files()
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path in selected:
            info=zipfile.ZipInfo((Path(ROOT.name)/path.relative_to(ROOT)).as_posix(),date_time=(2026,11,17,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16
            archive.writestr(info,path.read_bytes(),compresslevel=9)
    with zipfile.ZipFile(output) as archive:
        bad=archive.testzip()
        if bad:raise SystemExit('ZIP CRC failed: '+bad)
        for path in selected:
            name=(Path(ROOT.name)/path.relative_to(ROOT)).as_posix()
            if archive.read(name)!=path.read_bytes():raise SystemExit('ZIP byte mismatch: '+name)
    print(json.dumps({'file':str(output),'files':len(selected),'bytes':output.stat().st_size,
                      'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
                      'crc_verified':True,'all_file_bytes_verified':True},ensure_ascii=False))

if __name__=='__main__':main()
