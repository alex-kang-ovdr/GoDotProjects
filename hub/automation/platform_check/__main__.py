from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime,timezone
from html import escape
import json
from pathlib import Path
import platform
import sys
from xml.etree.ElementTree import Element,SubElement,tostring
from .catalog import validate_catalog
from .archive import validate_archive
from .contracts import validate_contracts,validate_events

ROOT=Path(__file__).resolve().parents[2]

def write_reports(report,destination):
    destination=destination.resolve();destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    rows=''.join('<tr><td>'+escape(c['id'])+'</td><td><span class="'+escape(c['status'])+'">'+escape(c['status'])+'</span></td><td>'+escape(c['title'])+'</td><td>'+escape(c['message'])+'</td></tr>' for c in report['checks'])
    page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>플랫폼 정적 검증 보고서</title><style>body{font-family:system-ui,\"Malgun Gothic\",sans-serif;background:#f3f6f7;color:#18362f;max-width:1400px;margin:30px auto;padding:25px;line-height:1.7}header,section{background:white;border:1px solid #dce5e1;border-radius:12px;padding:25px;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:10px;border-bottom:1px solid #e1e8e4;text-align:left;vertical-align:top;overflow-wrap:anywhere}.pass{color:#1c7a47}.fail{color:#ac3029}.warning{color:#a15a11}.skip{color:#777}.scroll{overflow-x:auto}small{color:#65776c}</style><header><h1>플랫폼 정적 검증 보고서</h1><p>범위: 파일·스키마·패키지 계약. 게임 실행, 실제 IIS 설치, Google 로그인 완료를 의미하지 않습니다.</p><small>'''+escape(report['generatedAt'])+' · Python '+escape(report['python'])+'</small><p>'+escape(str(report['summary']))+'</p></header><section class="scroll"><table><thead><tr><th>ID</th><th>상태</th><th>검사</th><th>결과</th></tr></thead><tbody>'+rows+'</tbody></table></section></html>'
    destination.with_suffix('.html').write_text(page,encoding='utf-8')
    suite=Element('testsuite',name='platform-static-validation',tests=str(len(report['checks'])),failures=str(report['summary'].get('fail',0)))
    for c in report['checks']:
        case=SubElement(suite,'testcase',classname='platform_check',name=c['id'])
        if c['status']=='fail':SubElement(case,'failure',message=c['message']).text=c['message']
        elif c['status'] in ('skip','warning'):SubElement(case,'skipped',message=c['message'])
    destination.with_suffix('.xml').write_bytes(tostring(suite,encoding='utf-8',xml_declaration=True))

def main():
    parser=argparse.ArgumentParser(description='Read-only platform validation; exit 0=no failures, 1=validation failures, 2=usage error.')
    parser.add_argument('command',choices=['contracts','catalog','archive','events','all'])
    parser.add_argument('--project',type=Path,help='Built user web root, e.g. PoC/dist/user')
    parser.add_argument('--catalog',type=Path,default=Path('catalog/games.json'))
    parser.add_argument('--archive',type=Path)
    parser.add_argument('--events',type=Path)
    parser.add_argument('--specs',type=Path,default=ROOT/'specs')
    parser.add_argument('--report',type=Path,default=ROOT/'reports/static-validation.json')
    args=parser.parse_args();checks=[]
    if args.command in ('all','catalog') and not args.project:parser.error('--project is required for catalog/all; pass a built project, not a proposed example path.')
    if args.command=='archive' and not args.archive:parser.error('--archive is required')
    if args.command=='events' and not args.events:parser.error('--events is required')
    if args.command in ('all','contracts'):checks.extend(validate_contracts(args.specs))
    if args.command in ('all','catalog'):checks.extend(validate_catalog(args.project,args.catalog,args.specs))
    if args.archive and args.command in ('all','archive'):checks.extend(validate_archive(args.archive))
    if args.events and args.command in ('all','events'):checks.extend(validate_events(args.events,args.specs))
    summary=dict(Counter(c['status'] for c in checks))
    report={'version':'0.2.0','scope':'static-contract-and-package-validation','generatedAt':datetime.now(timezone.utc).isoformat(),'python':platform.python_version(),'summary':summary,'checks':checks}
    write_reports(report,args.report)
    print(json.dumps({'summary':summary,'report':str(args.report.resolve()),'scope':report['scope']},ensure_ascii=False))
    for c in checks:
        if c['status']=='fail':print(f"FAIL {c['id']}: {c['message']}",file=sys.stderr)
    return 1 if summary.get('fail',0) else 0

if __name__=='__main__':raise SystemExit(main())
