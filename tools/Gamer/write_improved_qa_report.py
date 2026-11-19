"""Build an improvement-focused report from preserved live-browser evidence."""
import hashlib
import json
import math
import re
import shutil
import statistics
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'Reports/2026-11-18-improved-model-qa'
RUNS = [
    'improved-model-fortress-8', 'improved-model-besiege-8',
    'improved-guided-besiege', 'improved-hybrid-besiege',
    'improved-guided-fortress', 'improved-confirm-fortress', 'improved-confirm-besiege',
]

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def link(label, path):
    return f'[{label}](<{path.as_posix()}>)'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    figures = OUT / 'figures'
    figures.mkdir(exist_ok=True)
    records, evidence, screenshots, table = {}, [], {}, []
    calls = 0
    for name in RUNS:
        directory = ROOT / 'TestResults' / name
        summary = read(directory / 'summary.json')
        assert len(summary['results']) == 1, name
        result = summary['results'][0]
        game = result['game']
        rows = [json.loads(line) for line in (directory / game / 'steps.jsonl').read_text(encoding='utf-8').splitlines()]
        decisions = [row for row in rows if row['event'] == 'decision']
        observations = [row for row in rows if row['event'] == 'observation']
        changed = sum(row['assistance']['changed'] for row in decisions)
        values = sorted(row['response']['latency_ms'] for row in decisions)
        calls += len(decisions)
        stats = {'calls': len(decisions), 'changed': changed, 'p50_ms': statistics.median(values), 'p95_ms': values[math.ceil(.95 * len(values)) - 1]}
        records[name] = dict(result=result, summary=summary, rows=rows, decisions=decisions, observations=observations, stats=stats)
        outcome = f"적 피해 {result['enemyDamage']}" if game == 'fortress-blue' else f"사격 {result['shots']}, 파괴 {result['destroyed']}/9"
        status = '목표 통과' if result['objectiveMet'] else '관측 불일치로 중단' if result.get('failure') else '전체 목표 미달성'
        table.append(f"| {name} | {result['controller']} | {len(decisions)} | {changed} | {outcome} | {status} |")

    def figure(key, run, game, filename):
        source = ROOT / 'TestResults' / run / game / filename
        target = figures / f'{key}.png'
        shutil.copy2(source, target)
        evidence.append({'image': target.name, 'source': str(source), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        screenshots[key] = f'![{key}](<{target.as_posix()}>)'

    figure('fortress-before', 'improved-guided-fortress', 'fortress-blue', '000-bootstrap.png')
    figure('fortress-hit-308', 'improved-guided-fortress', 'fortress-blue', 'final.png')
    figure('fortress-confirmed-hit', 'improved-confirm-fortress', 'fortress-blue', 'final.png')
    figure('besiege-model-five-shots-three-targets', 'improved-model-besiege-8', 'besiege', 'final.png')
    figure('besiege-first-shot', 'improved-hybrid-besiege', 'besiege', '001-after.png')
    figure('besiege-six-targets', 'improved-hybrid-besiege', 'besiege', '003-after.png')
    figure('besiege-mission-complete', 'improved-hybrid-besiege', 'besiege', 'final.png')
    figure('besiege-confirmed-complete', 'improved-confirm-besiege', 'besiege', 'final.png')

    fort = records['improved-guided-fortress']
    siege = records['improved-hybrid-besiege']
    fort_confirm = records['improved-confirm-fortress']
    siege_confirm = records['improved-confirm-besiege']
    assert fort['result']['enemyDamage'] > 0 and fort_confirm['result']['enemyDamage'] > 0
    assert siege['result']['won'] and siege_confirm['result']['won']
    assert all(not row['assistance']['actionOverridden'] for row in fort['decisions'] + fort_confirm['decisions'])
    assert all(row['executed'] == row['validated'] for row in fort['decisions'] + fort_confirm['decisions'])
    assert records['improved-model-besiege-8']['result']['modeGuard']['modifiedDecisions'] == 0
    for successful in [fort, siege, fort_confirm, siege_confirm]:
        assert not successful['summary']['errors']
        assert not successful['result'].get('failure')
        assert successful['result']['apiFailures'] == successful['result']['invalid'] == 0
    assert all(row['response']['device'] == 'cuda' for r in records.values() for row in r['decisions'])
    full_siege = siege['observations'][-1]['telemetry']['sim']
    stage_rows = []
    for decision, observation in zip(siege['decisions'], siege['observations']):
        state = observation['telemetry']['sim']
        keys = ' / '.join('+'.join(group) or '해제' for group in decision['executed']['steps'])
        stage_rows.append(f"| {decision['step']} | {keys} | {decision['groupTicks'] / 30:.3f}초 | {state['shots']} | {state['destroyed']}/9 |")

    report = f'''# PlayHub 포트리스·비시즈 QA 개선 결과

작성: {datetime.now(timezone(timedelta(hours=9))).isoformat(timespec='seconds')}

## 결과

**포트리스 명중과 비시즈 사격·목표 파괴를 실제 브라우저에서 확인했다.** 포트리스는 적 피해 **308**, 비시즈는 모델이 생성한 조작으로 **5회 사격·3개 파괴**, 보조 제어기를 적용한 실행에서는 **3발로 9개 전부 파괴**했다. 포트리스 명중과 비시즈 전체 목표 완료는 각각 새 브라우저·새 게임에서 한 번씩 추가 재현했다.

이 성공을 GameScaling 소형 모델의 완전 자율 성능으로 해석하면 안 된다. 포트리스는 게임 물리로 계산한 충전·방출 계획을 모델에 안내했고 **모델이 반환한 입력을 그대로 적용**했다. 비시즈의 전체 완료는 **모델 제안을 보조 제어기 입력으로 대체**한 결과다. 모델 원본, 계획, 실행 입력과 대체 여부를 별도로 기록했다.

| 최종 검증 | 결과 | 반복 검증 | 입력 출처 |
|---|---|---|---|
| 포트리스 명중 | HP 880→572, 1발, 피해 308 | 동일 피해 재현 | 물리 계획 안내 → 실제 모델 출력, 입력 대체 0회 |
| 비시즈 모델 조작 | 5발, 목표 3/9 파괴 | 이 조건은 1회 탐색 | 현재 턴 전투 지시 → 실제 모델 출력, 가드 변경 0회 |
| 비시즈 전체 완료 | 3발, 목표 9/9, 코어 HP 100, 승리 | 동일 결과 재현 | 실제 모델 제안 기록 + 4개 결정 모두 보조 제어기 적용 |

설치 폴더는 `D:\\Github\\Experiments\\Gamer`, 게임 원본은 `D:\\Github\\GoDotProjects-worktrees\\PlayHub-Platform`이다. 각 실행 시작 시 최신 Web 파일을 임시 PlayHub 환경에 복사했다. 게임의 물리, 목표 HP, 탄약, 승리 조건은 수정하지 않았다.

## 실패 원인과 수정

### 포트리스: 짧은 충전과 방출 누락

이전 60회 실행의 최초 Space 입력은 한 그룹, 약 33ms였다. 실제 완료 액션은 파워 2%, 적 피해 0이었다. 지형이 파괴됐다는 사실만으로 명중을 판정할 수 없다.

충전 시간을 단순히 늘린 첫 개선 실행에서는 모델이 8회 연속 Space를 누른 채 놓지 않았다. 게임 시간 약 48초 동안 모델 입력으로 완료된 발사가 없었다. 종료 정리 때 발생한 키 해제·발사는 성과에서 제외했다. 충전 게이지는 초당 72%p이며 최대치에서 다시 내려오는 방식이므로 오래 누르는 것만으로 정확도를 높일 수 없다.

수정된 계획은 현재 맵·바람·탱크 위치와 동일한 엔진의 별도 시뮬레이터로 탄도를 탐색한다. 이번 초기 상태에서는 **45° / 38% / Space 0.533초 후 해제**가 명중했다. 모델에 이 순서를 안내했고 실제 출력은 `Space / 해제 / 해제 / 해제 / 해제 / 해제`였다. 각 그룹을 0.533초 실행하여 첫 그룹에서 충전하고 두 번째에서 방출했다. 실제 엔진의 `lastAction.reason=hit`, `damageToEnemy=308` 및 HP 감소를 함께 확인했다.

이 조준기는 초기 지형을 전제로 한다. 지형이 달라지면 중단하며, 다른 맵·탱크까지 일반화했다고 주장하지 않는다.

### 비시즈: 사격 키 부재와 반대 방향 이동

이전 30회 입력 제한 실행의 원본에는 F가 **0개**, S가 **26개 그룹**, Space가 **12개 그룹** 있었다. Space 제거는 작업장 복귀만 막았고, 모델은 표적 반대 방향으로 움직였다. 탄약 12발이 그대로였으므로 사격 실패를 충돌 판정 문제로 볼 근거는 없다.

현재 턴에 “이미 전투 중이며 F로 발사, Space 금지”라는 짧은 지시를 추가하자 실제 모델이 F를 생성했다. 8회 추론에서 **5회 사격·3/9 파괴**까지 진행했지만, 이후 후진하며 전체 목표에는 도달하지 못했다. 별도 정밀 순서 안내 시도에서도 모델이 Space를 눌러 작업장으로 돌아갔다. 해당 실패 실행도 보존했다.

전체 완료 검증에는 기본 Rover의 포신을 조금 올려 중앙을 쏜 뒤 Q/E로 좌우를 조준하는 보조 제어기를 사용했다. 별도 엔진에서 계획을 검증하고 브라우저에서는 정상 키 이벤트만 보냈다. 다음 단계 전에는 실제 경과 시간·사격 수·파괴 수·탄약·코어 HP·결과가 예측과 맞는지 검사한다. 데이터가 어긋나면 중단한다.

| 결정 | 실제 적용한 6개 키 그룹 | 그룹당 게임 시간 | 누적 사격 | 파괴 |
|---:|---|---:|---:|---:|
{chr(10).join(stage_rows)}

최종 탄약은 **{full_siege['ammo']}**, 코어 HP는 **{full_siege['coreHp']}**, `won={str(full_siege['won']).lower()}`, `outcome={full_siege['outcome']}`다. 시작 준비 이후 게임 경과 시간은 **{siege['result']['simSeconds']:.3f}초**, 게임 자체의 누적 경과는 **{full_siege['elapsed']:.3f}초**다. 앞선 6초 실험도 충분히 길 수 있었으므로 비시즈 실패의 주원인은 시간 부족보다 잘못된 조작이었다.

### 공통 실행기와 문맥 수정

- `instruction`: 현재 화면에 대한 지시를 별도로 전달한다. 매번 시스템 프롬프트를 바꾸거나 모델 문맥·시드를 초기화하지 않는다.
- `previous_action`: 다음 추론의 직전 행동 문맥에 실제 실행한 입력을 넣는다. 가드·보조 제어기 사용 후 원본 제안만 기억하던 불일치를 줄였다.
- 화면 입력을 기존 576×360에서 **960×600**으로 높였다. 별도 절제 실험이 아니므로 해상도만의 개선 효과는 입증하지 않았다.
- 입력 그룹의 유지 시간을 명시하고, 매 결정에 `groupTicks`, `simulatedActionSeconds`, `instruction`, `validated`, `executed`, `assistance`를 남긴다.
- `-RequireObjective`를 켜면 단순 이동·파싱 성공만으로 통과하지 않는다. 포트리스는 적 피해, 비시즈는 9/9 승리를 요구한다.

## 실제 실행 전체 결과

이번 개선에서 게임 화면 기반 실제 CUDA 추론을 **{calls}회** 실행했다. 아래 모델 호출에는 보조 제어기 실행 중 수집한 제안도 포함되며, 이를 모델의 단독 플레이 성공으로 세지 않는다.

`model`은 전투 지시를 받은 모델 출력, `guided`는 상세한 물리 계획을 안내받은 모델 출력, `hybrid`는 모델 제안을 기록하고 보조 제어기 입력을 적용하는 방식이다. “대체”는 모델의 유효 입력과 실제 실행 입력이 달라진 결정 수다.

| 실행 | 방식 | 모델 호출 | 대체 | 관측 결과 | 판정 |
|---|---|---:|---:|---|---|
{chr(10).join(table)}

정밀 안내를 따르지 않아 중단된 비시즈 실행은 정상적으로 실패로 남았다. 그 실행의 `failure`를 제품 크래시나 모델 API 오류로 오인하지 않는다. 성공 실행들은 예상 외 브라우저 오류와 API 실패가 없었다.

## 증거 화면

포트리스 시작: 적 HP 880.

{screenshots['fortress-before']}

포트리스 명중: 피해 308, 적 HP 572, 45° / 38%가 화면과 상태 로그에 일치한다.

{screenshots['fortress-hit-308']}

새 게임에서 같은 결과를 재현했다.

{screenshots['fortress-confirmed-hit']}

비시즈 모델 조작만 적용한 개선 실행: 5회 사격, 3/9 파괴. 전체 완료와 구분한다.

{screenshots['besiege-model-five-shots-three-targets']}

보조 제어기 첫 사격 후. 원본 모델 제안은 로그에 따로 남겼다.

{screenshots['besiege-first-shot']}

보조 제어기 세 번째 결정 후: 2회 사격, 6/9 파괴.

{screenshots['besiege-six-targets']}

최종 Mission Complete: 3회 사격, 9개 파괴, 연결부 100% 유지.

{screenshots['besiege-mission-complete']}

새 게임에서도 Mission Complete를 재현했다.

{screenshots['besiege-confirmed-complete']}

## 검증과 적용 범위

- 추론 서버 테스트 **10/10 통과**: 기존 요청 호환, 동적 지시, 실행 입력 문맥, 잘못된 요청, 시드·생성 설정.
- 입력 실행기·두 게임 제어기 테스트 **11/11 통과**. 포트리스는 이전 2% 실패와 새 38% 명중을 실제 물리로 비교했다. 비시즈는 CDP 키 이벤트를 게임 입력 해석기와 물리에 연결해 3발·9개 파괴·코어 HP 100을 단언했다.
- 실제 Chrome에서 포트리스 명중 **2/2**, 비시즈 보조 제어기 전체 완료 **2/2**. 작은 고정 시나리오의 재현 확인이며 통계적 성공률이나 장시간 안정성 검증은 아니다.
- 추론 중 게임 프레임을 멈추는 방식이다. 실시간 Gamer 엔진 성능을 재현한 것이 아니다. 메뉴·UI 타이머는 실제 시간을 사용한다.
- 소형 모델의 전투 지시 반응은 개선됐으나 전체 목표 계획은 부족하다. 현재 도입안은 **결과 단언과 명시적인 보조 제어기를 갖춘 QA**다. 모델만으로 임의 게임을 자율 완료할 수 있다고 판단하지 않는다.

## 재실행

설치된 환경에서 첫 PowerShell 창:

```powershell
Set-Location D:\\Github\\Experiments\\Gamer
.\\Run-Inference.ps1 -Device cuda -Temperature 1 -Seed 42 -HistoryFrames 1 -MaxWidth 960 -MaxHeight 600
```

별도 창에서 새 실행 이름을 사용한다.

```powershell
Set-Location D:\\Github\\Experiments\\Gamer
.\\Run-ModelQA.ps1 -Game fortress-blue -Steps 4 -Controller guided -StopOnObjective -RequireObjective -RunId replay-fortress-hit-01
.\\Run-ModelQA.ps1 -Game besiege -Steps 6 -BesiegeStart play -Controller hybrid -StopOnObjective -RequireObjective -RunId replay-besiege-complete-01
```

비시즈 모델 조작만 비교하려면 `-Controller model -Guidance combat -GroupTicks 3 -GuardPlayMode -Steps 8`을 사용한다. 이 조건은 목표 3개 파괴까지 확인한 조건이며 전체 완료 보장은 없다. 새 실행은 최신 게임 파일에서 시작하고, 계획과 상태가 맞지 않으면 실패를 기록한다.

## 원본 로그와 수정 파일

'''
    for name, rec in records.items():
        directory = ROOT / 'TestResults' / name
        game = rec['result']['game']
        report += f'- **{name}**: {link("집계", directory / "summary.json")}, {link("모델·입력·상태 로그", directory / game / "steps.jsonl")}\n'
    report += '\n수정·추가 파일:\n\n'
    for filename in ['inference_server.py', 'test_inference_server.py', 'playhub_model_qa.mjs', 'playhub_model_qa.test.mjs', 'fortress_planner.mjs', 'fortress_planner.test.mjs', 'besiege_planner.mjs', 'besiege_planner.test.mjs', 'Run-Inference.ps1', 'Run-ModelQA.ps1']:
        report += f'- {link(filename, ROOT / filename)}\n'
    report += f'''
검증 로그: {link('추론 서버 10개', ROOT / 'TestResults/improved-inference-tests.log')}, {link('제어기 11개', ROOT / 'TestResults/improved-all-controller-tests.log')}, {link('실제 추론 서버', ROOT / 'TestResults/improved-inference-server.log')}.

{link('스크린샷 원본·해시 목록', OUT / 'evidence-manifest.json')} · {link('이전 실패 중심 리포트', ROOT / 'Reports/2026-11-18-model-qa/REPORT.md')}.

사용 모델: [공개 GameScaling-0.8B-S3](https://huggingface.co/THUSI-Lab/GameScaling-0.8B-S3). 새 학습·가중치 변경은 하지 않았다. 개선은 입력 문맥, 시간 제어, 물리 기반 안내 및 보조 제어기에서 이뤄졌다.
'''
    (OUT / 'REPORT.md').write_text(report, encoding='utf-8')
    (OUT / 'evidence-manifest.json').write_text(json.dumps({'images': evidence}, ensure_ascii=False, indent=2), encoding='utf-8')
    for name in re.findall(r'\]\(<([A-Z]:/[^>]+)>\)', report):
        assert Path(name).is_file(), name
    for entry in evidence:
        assert hashlib.sha256(Path(entry['source']).read_bytes()).hexdigest() == entry['sha256']
    print(json.dumps({'report': str(OUT / 'REPORT.md'), 'real_model_calls': calls, 'screenshots_verified': len(evidence)}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
