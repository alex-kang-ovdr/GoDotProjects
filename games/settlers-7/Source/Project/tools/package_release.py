"""Package v27 only from fresh, unchanged validation results.

Usage: python tools/run_checks.py [--browser]
       python tools/package_release.py [--out-dir /path/to/release]

Browser blocks/unexecuted suites remain explicitly unverified. They never enter
passing counts. No historical screenshot or old release test total is reused.
"""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import argparse
import hashlib
import html
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'
parser = argparse.ArgumentParser()
parser.add_argument('--out-dir', type=Path, default=ROOT.parent / 'release')
args = parser.parse_args()
OUT = args.out_dir.resolve()
if OUT == ROOT or ROOT in OUT.parents:
    raise SystemExit('Release output must be outside the packaged source folder.')
OUT.mkdir(parents=True, exist_ok=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def esc(value):
    return html.escape(str(value), quote=True)


check = read_json(REPORTS / 'check_run.json')
if check.get('version') != 27 or check.get('failures') or not check.get('sourceUnchangedDuringChecks'):
    raise SystemExit('Run passing v27 checks on unchanged sources before packaging.')
for relative, expected in check['sourceHashes'].items():
    path = ROOT / relative
    if not path.is_file() or digest(path) != expected:
        raise SystemExit('Checked source changed: ' + relative)
for relative, expected in check.get('reportHashes', {}).items():
    path = REPORTS / relative
    if not path.is_file() or digest(path) != expected:
        raise SystemExit('Validation report changed: ' + relative)
expected_scripts = {'engine.test.js', 'v25.test.js', 'v26.test.js', 'v27.test.js', 'v27_templates.test.js'}
actual_scripts = {s['script'] for s in check['suites'] if s['kind'] in ('engine', 'template') and s['status'] == 'passed'}
if expected_scripts != actual_scripts:
    raise SystemExit('All five engine/template suites must pass.')
suites = []
for item in check['suites']:
    suite = dict(item)
    if suite['status'] == 'failed':
        raise SystemExit('Cannot package a failing suite: ' + suite['script'])
    if suite['status'] == 'passed':
        data = read_json(REPORTS / suite['file'])
        results = data.get('results', [])
        if len(results) != suite['count'] or sum(bool(r.get('passed')) for r in results) != suite['passed'] or suite['failed']:
            raise SystemExit('Result count mismatch: ' + suite['file'])
        suite['results'] = results
    else:
        suite.update(count=0, passed=0, failed=0, results=[])
    suites.append(suite)

baseline = read_json(ROOT / 'reference/BASELINE_v26.json')
preserved = []
for original in baseline['files']:
    path = ROOT / original['file']
    current = digest(path)
    same = current == original['sha256'] and path.stat().st_size == original['bytes']
    preserved.append({**original, 'currentSha256': current, 'identical': same})
if not all(row['identical'] for row in preserved):
    raise SystemExit('Reference or balance source changed; inspect before release.')
preservation = {'baseline': 'v26', 'sourceArchive': baseline['sourceArchive'], 'allIdentical': True, 'files': preserved}
save_json(REPORTS / 'source_preservation.json', preservation)

probe_path = REPORTS / 'browser_environment_probe.json'
probe = read_json(probe_path) if probe_path.exists() else {}
launch_blocked = probe.get('status') == 'blocked' and probe.get('count') == 0
browser_suites = [s for s in suites if s['kind'] == 'browser']
browser_verified = bool(browser_suites) and all(s['status'] == 'passed' for s in browser_suites)
limits = {
    'browserVerified': browser_verified,
    'browserSuiteStatuses': sorted({s['status'] for s in browser_suites}),
    'previousLaunchProbe': {'status': probe.get('status', 'not_available'), 'count': probe.get('count', 0),
                            'file': 'browser_environment_probe.json' if probe else None,
                            'sha256': digest(probe_path) if probe else None},
    'launchBlock': 'Chromium process singleton socket(): Operation not permitted' if launch_blocked else None,
    'currentBrowserScenariosExecuted': sum(s['count'] for s in browser_suites),
    'physicalDeviceTested': False,
    'fileProtocolTested': False,
    'browserStorageRestartTested': False,
    'templateChecksAreBrowserTests': False,
    'historicalBrowserResultsIncluded': False
}
save_json(REPORTS / 'environment_limits.json', limits)


def totals(kind):
    selected = [s for s in suites if s['kind'] == kind]
    return {field: sum(s[field] for s in selected) for field in ('count', 'passed', 'failed')}


summary = {
    'version': 27,
    'title': '부대 편성·영토 간 증원·전투 인원 보존',
    'verifiedAt': check['verifiedAt'],
    'packagedAt': datetime.now(timezone(timedelta(hours=9))).isoformat(),
    'status': 'validated' if browser_verified else 'engine_and_template_validated_browser_unverified',
    'balanceProfile': 'v24_playable_hybrid',
    'engine': totals('engine'), 'template': totals('template'), 'browser': totals('browser'),
    'suites': [{k: v for k, v in s.items() if k != 'results'} for s in suites],
    'build': check['build'],
    'sourceHashes': check['sourceHashes'],
    'unchangedSources': preservation,
    'limits': limits,
    'notOriginalRuleRestoration': True
}
save_json(REPORTS / 'release_summary.json', summary)

engine = summary['engine']
template = summary['template']
checks_html = []
labels = {'engine': '공통 엔진', 'template': 'UI 순수 템플릿', 'browser': '브라우저'}
for suite in suites:
    if suite['status'] == 'passed':
        rows = ''.join('<tr><td>' + esc(r['name']) + '</td><td class="ok">통과</td></tr>' for r in suite['results'])
        checks_html.append('<details><summary><span>' + labels[suite['kind']] + ' · ' + esc(suite['script']) +
                           '</span><b>' + str(suite['passed']) + ' / ' + str(suite['count']) +
                           '</b></summary><div class="scroll"><table><thead><tr><th>실제 검사 항목</th><th>결과</th></tr></thead><tbody>' +
                           rows + '</tbody></table></div></details>')
    else:
        label = '실행 환경 차단' if suite['status'] == 'blocked' else '미실행'
        checks_html.append('<details><summary><span>브라우저 · ' + esc(suite['script']) + '</span><b class="pending">' + label +
                           '</b></summary><p>이번 통합 검사에서 실행된 시나리오는 0개입니다. 통과 합계에 포함하지 않습니다.</p></details>')
source_rows = ''.join('<tr><td><code>' + esc(row['file']) + '</code></td><td class="ok">바이트 동일</td><td><code class="hash">' +
                      row['sha256'] + '</code></td></tr>' for row in preserved)
if browser_verified:
    browser_badge = str(summary['browser']['passed']) + ' / ' + str(summary['browser']['count'])
    browser_note = '보고서의 브라우저 suite 결과를 확인하세요. 물리 기기, 직접 파일 실행, 브라우저 재시작 저장 지속성은 별도 미검증입니다.'
else:
    browser_badge = '미검증'
    browser_note = ('이번 환경에서 Chromium 시작 단계의 socket() 권한 오류가 확인되어 브라우저를 열지 못했습니다. '
                    'v27 브라우저 시나리오 20개는 작성 및 Python 문법 확인을 마쳤지만 실행 통과로 계산하지 않았습니다. '
                    '최종 통합 실행에서는 엔진·템플릿 검사를 수행하고 브라우저 시나리오는 실행하지 않았습니다. '
                    '실제 화면 클릭, 모바일 표시, 직접 파일 열기, 브라우저 재시작 후 저장 지속성은 미검증입니다.')
report = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>세틀러 7 v27 — 게임 플레이 구현·검증 보고서</title>
<style>
:root{color-scheme:light;--ink:#1b343b;--muted:#53676c;--paper:#f5f4ef;--line:#d5dfd9;--green:#245c50;--gold:#dec492;--warn:#86600d}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.8 system-ui,-apple-system,"Malgun Gothic",sans-serif}a{color:var(--green);text-underline-offset:4px}header{background:#163a3c;color:#f9f6ec;padding:48px 24px 42px}.wrap{max-width:1120px;margin:auto}.eyebrow{font-size:11px;letter-spacing:.19em;color:var(--gold)}h1{font-size:clamp(30px,5.2vw,53px);line-height:1.22;letter-spacing:-.045em;margin:20px 0}h1 em{font-style:normal;color:var(--gold)}header p{max-width:790px;color:#d4e1dc;font-size:16px}header .badge{display:inline-block;border:1px solid #688583;border-radius:30px;padding:4px 12px;font-size:12px;margin:9px 8px 0 0;color:#d4e1dc}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.actions a{background:#e5cda1;color:#163a3c;border-radius:5px;padding:10px 16px;text-decoration:none;font-weight:700}.actions a.secondary{background:transparent;color:#e7ece6;border:1px solid #688583}main{max-width:1120px;margin:auto;padding:0 24px 64px}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:26px 0}.stat{border:1px solid var(--line);border-top:3px solid var(--green);background:#fff;padding:17px 18px;border-radius:4px}.stat strong{display:block;font-size:28px;line-height:1.4;letter-spacing:-.04em}.stat small{color:var(--muted)}.stat.warning{border-top-color:#b1883c}.stat.warning strong{color:var(--warn)}nav{display:flex;gap:18px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:3px 0 18px;font-size:13px}section{scroll-margin-top:24px}h2{font-size:25px;line-height:1.4;margin:42px 0 16px;letter-spacing:-.03em}h2 span{font:11px/1 system-ui,sans-serif;letter-spacing:.12em;color:#71877f;display:block;margin-bottom:10px}h3{font-size:17px;margin:0 0 8px}p{margin:10px 0 16px;color:var(--muted)}strong,b{color:inherit}.notice{padding:18px 20px;border:1px solid #dfc897;background:#fbf4e6;border-radius:4px;color:#67521e;margin:20px 0}.notice p{color:inherit;margin:6px 0 0}.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0}.step{padding:22px;background:#e7eeea;border:1px solid #cfdbd3;border-radius:5px}.step .number{font:12px/1.2 system-ui,sans-serif;letter-spacing:.14em;color:#58776b;display:block;margin-bottom:12px}.step p{font-size:14px;margin-bottom:0}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{vertical-align:top;text-align:left;padding:13px 12px;border-bottom:1px solid var(--line)}th{background:#e9efeb;color:#476158;font-weight:700}td:first-child{min-width:105px;font-weight:600}td p{margin:0}.code,code{font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}code{background:#e9eeea;padding:2px 4px;border-radius:3px}code.hash{display:block;font-size:10px;word-break:break-all;min-width:180px}.twocol{display:grid;grid-template-columns:1fr 1fr;gap:16px}.fix{border:1px solid var(--line);border-radius:5px;padding:22px;background:white}.fix .tag{display:inline-block;padding:2px 7px;font-size:11px;border-radius:3px;color:#7d4d2c;background:#f6e7db;margin-bottom:12px}.fix p{font-size:14px}.fix p:last-child{margin-bottom:0}details{border:1px solid var(--line);background:#fff;border-radius:4px;margin:9px 0;padding:0 16px}summary{cursor:pointer;display:flex;justify-content:space-between;gap:15px;align-items:center;padding:14px 0;font-size:13px;list-style-position:inside}summary b{white-space:nowrap;color:var(--green)}details p{font-size:13px}.ok{color:var(--green);font-weight:700}.pending{color:var(--warn)!important}.intro{max-width:870px}.note{font-size:12px;color:#647b73}.filelist{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.filelist div{padding:17px;background:#fff;border:1px solid var(--line);border-radius:4px;min-width:0}.filelist code{font-size:11px;overflow-wrap:anywhere;display:block}.filelist p{font-size:13px;margin:7px 0 0}pre{background:#183b3d;color:#ecf0e6;padding:20px;border-radius:4px;overflow:auto;font:12px/1.8 ui-monospace,Consolas,monospace}ul,ol{padding-left:23px;color:var(--muted)}li{margin:7px 0}footer{border-top:1px solid var(--line);padding-top:22px;margin-top:38px;font-size:12px;color:var(--muted)}@media(max-width:760px){header{padding-top:30px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.steps,.twocol,.filelist{grid-template-columns:1fr}th,td{padding:10px 8px}summary{align-items:flex-start}summary span{overflow-wrap:anywhere}.stat strong{font-size:24px}main{padding:0 17px 40px}}@media print{header{background:#fff;color:#1b343b;padding:20px 0}header p{color:#53676c}header h1 em{color:#245c50}.actions,nav{display:none}main{padding:0}.stats{break-inside:avoid}.step,.fix,table{break-inside:avoid}details{break-inside:avoid}.notice{background:#fff}h2{break-after:avoid}}
</style></head><body>
<header><div class="wrap"><div class="eyebrow">KINGDOM ATELIER / PLAYABLE RELEASE 27</div><h1>부대를 편성하고,<br><em>새 영토로 증원하세요.</em></h1><p>병사·성직자·상인의 실제 이동과 현장 합류를 연결했습니다. 출발 전에 편성·비용·경로를 확인하고, 전투 중 인원이 중복되거나 사라지던 문제를 수정한 v27 실행판입니다.</p><span class="badge">v26 기반 구현 개선</span><span class="badge">단일 HTML · 외부 의존성 없음</span><span class="badge">v24·v25·v26 저장 읽기</span><div class="actions"><a href="Settlers7_Play_v27.html">게임 파일 열기 →</a><a class="secondary" href="#checks">검증 범위 확인</a></div></div></header>
<main><div class="stats"><div class="stat"><strong>@@ENGINE@@</strong><small>엔진 검사 통과</small></div><div class="stat"><strong>@@TEMPLATE@@</strong><small>UI 순수 템플릿 검사 통과</small></div><div class="stat warning"><strong>@@BROWSER@@</strong><small>브라우저 화면·조작 검사</small></div><div class="stat"><strong>11종 · 35명</strong><small>재배치 가능 인원 / 한 부대 상한</small></div></div>
<nav><a href="#play">플레이 흐름</a><a href="#fixes">수정한 결함</a><a href="#changes">구현 내용</a><a href="#checks">검증 결과</a><a href="#save">저장·재현</a><a href="#sources">원작 자료 보존</a></nav>
<div class="notice"><b>브라우저 검증 상태를 구분합니다.</b><p>@@BROWSER_NOTE@@</p></div>
<section id="play"><h2><span>01 / GAMEPLAY</span>확보한 영토가 다음 행동의 출발점이 됩니다.</h2><p class="intro">두 번째 지역을 확보한 뒤 수도의 인원을 전방으로 옮길 수 있습니다. 병력은 정복과 방어에, 상인과 성직자는 기존 매수·포교 등 각자의 행동에 사용합니다. 목적지에 필요한 시설과 자원은 기존 조건대로 준비해야 합니다.</p><div class="steps"><article class="step"><span class="number">STEP 01</span><h3>목적지와 편성 선택</h3><p><b>원정</b> 탭에서 아군 지역을 목적지로, 수도를 출발지로 선택합니다. 병종별 가용·선택·잔류 수량을 확인하고 보낼 인원을 정합니다.</p></article><article class="step"><span class="number">STEP 02</span><h3>도로를 따라 이동</h3><p><b>병력·인원 이동 출발</b>를 누르면 인원이 출발지에서 빠집니다. 부대 카드의 <b>지도 보기</b>로 실제 위치와 이동 경로를 확인합니다.</p></article><article class="step"><span class="number">STEP 03</span><h3>도착 후 증원·다음 원정</h3><p>목적지에 도착한 인원만 주둔군에 합류합니다. 방어전이 진행 중이면 방어에 참여하고, 전투가 끝난 뒤 다음 인접 목표로 출정할 수 있습니다.</p></article></div><p class="note">이 흐름은 기능 설명입니다. 실제 브라우저 실행 화면을 검증했다는 표현이나 과거 버전의 스크린샷을 사용하지 않았습니다.</p></section>
<section id="fixes"><h2><span>02 / REPRODUCED DEFECTS</span>인원이 두 곳에 존재하거나 사라지던 문제를 수정했습니다.</h2><div class="twocol"><article class="fix"><span class="tag">v26에서 재현</span><h3>방어군 10명에서 5명 출정 → 다시 10명</h3><p>교전 중 창병 10명 중 5명을 다른 곳으로 보낸 뒤 다음 전투 갱신에서 과거 방어 명단의 10명이 복원되었습니다. 떠난 5명까지 남아 중복되었습니다.</p><p><b>수정:</b> 교전 중인 출발지의 출발 명령을 거절하고, 전투 갱신을 실제 주둔군과 동기화합니다. 거절한 명령은 인원·자원을 바꾸지 않습니다.</p></article><article class="fix"><span class="tag">v26에서 재현</span><h3>방어 중 합류한 대포 → 다음 갱신에서 소실</h3><p>새 병력이 주둔군에 추가되어도 오래된 전투 명단이 주둔군을 덮어쓰면서 사라질 수 있었습니다.</p><p><b>수정:</b> 모집 완료·이동 도착·귀환 인원을 살아 있는 방어 명단에 반영합니다. 기존 병사의 남은 HP와 탄약, 민간 인원은 보존합니다.</p></article></div></section>
<section id="changes"><h2><span>03 / IMPLEMENTED BEHAVIOR</span>명령·화면·저장이 같은 규칙을 사용합니다.</h2><div class="scroll"><table><thead><tr><th>변경</th><th>실제 동작</th><th>조건·경계</th></tr></thead><tbody>
<tr><td>정확한 군사 편성</td><td>창병·총병·기병·대포·기수의 수량을 직접 정합니다. 총인원 빠른 편성도 병종별 초안으로 확인합니다.</td><td>총 1~35명. 기수 단독 공격은 거절합니다. 선택한 병력이 부족하면 전체 출발을 거절합니다.</td></tr>
<tr><td>아군 재배치</td><td>전체 11종 인원이 소유 도로를 따라 이동합니다. 여러 아군 지역을 경유할 수 있습니다.</td><td>출발과 목적지는 다른 아군 지역이어야 합니다. 도착하기 전에는 목적지 주둔 인원에 추가하지 않습니다.</td></tr>
<tr><td>출발 사전 검사</td><td>군사·매수·포교·재배치의 가능 여부, 실패 이유, 필요 인원·물품, 경로, 이동 시간을 표시합니다.</td><td>조회는 직렬화 상태를 바꾸지 않습니다. 실제 명령이 비용·인원·경로를 다시 검사합니다.</td></tr>
<tr><td>성벽 조건</td><td>실제로 선택한 부대에 총병 또는 대포가 있는지 검사합니다.</td><td>다른 지역이나 출발지에 남긴 원거리 병력으로 조건을 대신 충족하지 않습니다.</td></tr>
<tr><td>지도·상태 연결</td><td>금색 점선은 예정 경로, 파란 선은 이동 경로입니다. 카드에서 현재 위치를 찾아가거나 귀환을 명령합니다.</td><td>ETA는 이동 예상 시간입니다. 전투 시간·승률은 계산했다고 표시하지 않습니다.</td></tr>
<tr><td>소유권 변경·취소</td><td>목적지·현재 경유지를 잃거나 소유 도로로 목적지에 도달할 수 없으면 아군 지역으로 귀환합니다. 우회 가능한 소유 도로가 있으면 이동을 이어갑니다. 취소 시 현재 위치와 진행도를 유지합니다.</td><td>적 영토에 인원을 잘못 넣지 않습니다. 안전한 귀환지가 없으면 대기합니다.</td></tr>
<tr><td>귀환 화물</td><td>창고가 가득 차면 <b>귀환 물품 입고 대기</b>로 표시하고 화물·인원을 유지합니다.</td><td>입고 대기 중 ETA는 비워 둡니다. 공간이 생기면 실제 입고와 상인 귀환을 완료합니다.</td></tr>
<tr><td>입력 안정성</td><td>출발지·목적지별 초안, 감소한 가용 인원 안내, 전체 모집 비용 표시를 연결했습니다.</td><td>도움말 뒤의 Space 재개를 막고, 저장 복원 성공 후 오래된 배치 도구와 초안을 정리합니다.</td></tr>
</tbody></table></div><p>v26의 생산 목표·반복 보급·일괄 물품 운송·생산망 탐색과 기존 건설·연구·교역·승리 판정은 유지했습니다. 새 재배치는 인원을 이동시키며, 물품 보급은 기존 창고 운송을 사용합니다.</p></section>
<section id="checks"><h2><span>04 / VERIFICATION</span>통과한 검사와 실행하지 못한 검사를 나눠 기록했습니다.</h2><p>최종 검사 시각: <b>@@VERIFIED_AT@@</b> (한국 표준시). Node <b>@@NODE@@</b> · Python <b>@@PYTHON@@</b>. 과거 suite 이름도 이번 v27 엔진으로 다시 실행했습니다.</p><div class="scroll"><table><thead><tr><th>검사</th><th>결과</th><th>확인한 범위</th></tr></thead><tbody><tr><td>공통 엔진</td><td class="ok">@@ENGINE@@</td><td>정상 비용 승리, 경제·물류 회귀, 11종 이동, 편성·증원 인원 보존, 경로·소유권 변경, 저장 후 동일 진행.</td></tr><tr><td>UI 순수 템플릿</td><td class="ok">@@TEMPLATE@@</td><td>실제 엔진과 표시 함수 연결, 편성 5/11종, 비용·ETA, 초안 구분, 인원 감소 안내. DOM·레이아웃 검사는 아닙니다.</td></tr><tr><td>배포 파일</td><td class="ok">소스 정확히 포함</td><td>CSS·데이터·엔진·UI 포함 관계, 외부 script·stylesheet 부재, 검사 전후 소스 해시 일치.</td></tr><tr><td>브라우저</td><td class="pending">@@BROWSER@@</td><td>시작 환경 제한으로 현재 화면·조작 검사는 미검증. 과거 통과 수치를 합산하지 않았습니다.</td></tr></tbody></table></div>
@@CHECKS@@
<p class="note">엔진 검사 수는 개별 테스트 항목 수이며, 원작 일치율이나 모든 게임 상태의 커버리지를 뜻하지 않습니다. 전체 원장·통과 항목·실행 로그는 패키지의 reports/에 있습니다.</p></section>
<section id="save"><h2><span>05 / SAVE &amp; REPRODUCE</span>이동 중인 부대와 이전 저장을 이어갑니다.</h2><p>새 저장은 <code>S7-PLAYABLE-27</code>입니다. 유효한 v24·v25·v26 JSON을 읽으며 재고·예약·운반 중 화물과 v26 운영 정책을 유지합니다. 이전 버전의 오래된 방어 명단은 저장된 실제 주둔군에 맞추고, v27 저장의 모순된 전투 명단은 거절합니다.</p><p>브라우저 저장 키는 <code>S7_V27</code>, 두 백업은 <code>S7_V27_BACKUP_1/2</code>입니다. 이어하기는 v27→v26→v25→v24 순서로 찾습니다. 브라우저 저장을 사용할 수 없으면 <b>내보내기</b>로 JSON을 저장하세요. 새 저장은 과거 실행판에 역호환되지 않습니다.</p><div class="filelist"><div><code>Settlers7_Play_v27.html</code><p>데이터·공통 엔진·화면을 포함한 단일 실행 파일.</p></div><div><code>Settlers7_ReverseDesign_v27.zip</code><p>실행판, 소스, 구현 계약, 과거 참고 자료, 검사 코드·결과.</p></div><div><code>Settlers7_Implementation_Report_v27.html</code><p>변경 이유, 실제 동작, 검증 근거와 남은 확인 범위.</p></div></div><pre>python tools/run_checks.py
# Chromium이 실행 가능한 환경에서 선택:
python tools/run_checks.py --browser
python tools/package_release.py</pre><p>게임에는 Python·Node가 필요하지 않습니다. 개발·검증에만 사용합니다. 패키징은 검사 후 소스·결과가 바뀌면 중단하며, ZIP의 CRC와 파일별 SHA-256을 다시 확인합니다.</p></section>
<section id="sources"><h2><span>06 / SOURCE PRESERVATION</span>원작 참고 자료와 경제 데이터 4개를 그대로 보존했습니다.</h2><p>v26 입력 ZIP에서 읽은 파일과 현재 파일의 바이트·SHA-256을 비교했습니다. 원작 데이터 복원 이력은 유지하고, 이번 버전은 명령과 시뮬레이션의 연결을 개선합니다.</p><div class="scroll"><table><thead><tr><th>파일</th><th>v26 대비</th><th>SHA-256</th></tr></thead><tbody>@@SOURCES@@</tbody></table></div><div class="notice"><b>구현 개선과 원작 고증의 범위</b><p>생산 시간·전투 능력치·연구 비용·포교 계산·승리 조건은 기존 혼합 실행 프로필을 유지합니다. 재배치·사전 검사·교전 중 출발 제한은 이 실행판의 정책입니다. 원작 전체 캠페인·연구판·장군·3D·개별 병사 조작·새 경제 건설 AI의 완성을 주장하지 않습니다.</p></div></section>
<footer>세틀러 7 재구축 · v27 · 2026-11-18<br>원본 게임 그래픽·코드 추출 없이 기존 복원 자료와 독립 실행 프로필을 사용합니다.<br>확인 근거: game/engine.js · game/ui.js · tests/ · reports/check_run.json · reports/source_preservation.json</footer>
</main></body></html>"""
values = {
    '@@ENGINE@@': str(engine['passed']) + ' / ' + str(engine['count']),
    '@@TEMPLATE@@': str(template['passed']) + ' / ' + str(template['count']),
    '@@BROWSER@@': browser_badge,
    '@@BROWSER_NOTE@@': esc(browser_note),
    '@@VERIFIED_AT@@': esc(check['verifiedAt']),
    '@@NODE@@': esc(check['node']), '@@PYTHON@@': esc(check['python']),
    '@@CHECKS@@': ''.join(checks_html), '@@SOURCES@@': source_rows
}
for token, replacement in values.items():
    report = report.replace(token, replacement)
if '@@' in report:
    raise SystemExit('Unfilled report placeholder.')
(ROOT / 'Implementation_Report.html').write_text(report, encoding='utf-8')

# Keep transient interpreter caches outside the release manifest and ZIP.
for directory in list(ROOT.rglob('__pycache__')):
    shutil.rmtree(directory)
manifest = {str(f.relative_to(ROOT)): digest(f) for f in sorted(ROOT.rglob('*'))
            if f.is_file() and f.name != 'SHA256_MANIFEST.json'}
save_json(ROOT / 'SHA256_MANIFEST.json', {'runtimeVersion': 27, 'algorithm': 'SHA-256', 'files': manifest})
archive = OUT / 'Settlers7_ReverseDesign_v27.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for f in sorted(ROOT.rglob('*')):
        if f.is_file():
            bundle.write(f, str(Path(ROOT.name) / f.relative_to(ROOT)))
with zipfile.ZipFile(archive) as bundle:
    if bundle.testzip() is not None:
        raise SystemExit('ZIP CRC validation failed.')
    for relative, expected in manifest.items():
        if hashlib.sha256(bundle.read(str(Path(ROOT.name) / relative))).hexdigest() != expected:
            raise SystemExit('ZIP SHA-256 validation failed: ' + relative)
shutil.copy2(ROOT / 'Settlers7_Play_v27.html', OUT / 'Settlers7_Play_v27.html')
shutil.copy2(ROOT / 'Implementation_Report.html', OUT / 'Settlers7_Implementation_Report_v27.html')
deliverables = [OUT / 'Settlers7_Play_v27.html', archive, OUT / 'Settlers7_Implementation_Report_v27.html']
receipt = {'version': 27, 'files': [{'name': f.name, 'bytes': f.stat().st_size, 'sha256': digest(f)} for f in deliverables],
           'archiveFiles': len(manifest) + 1, 'zipCrcValidated': True, 'zipHashesValidated': True}
save_json(OUT / 'delivery_manifest.json', receipt)
print(json.dumps({'engine': summary['engine'], 'template': summary['template'], 'browser': summary['browser'],
                  'browserVerified': browser_verified, 'deliverables': receipt}, ensure_ascii=False, indent=2))
