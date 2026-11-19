"""Build the requested Markdown report from completed, preserved QA evidence."""
import hashlib
import json
import math
import shutil
import statistics
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'Reports' / '2026-11-18-model-qa'
RUNS = ['model-initial-3', 'model-sampled-20', 'model-gameplay-60', 'model-besiege-guarded-30']
NAMES = {'fortress-blue': '포트리스', 'besiege': '비시즈'}

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def link(label, path):
    return f'[{label}](<{path.as_posix()}>)'

def main():
    runs = {name: read(ROOT / 'TestResults' / name / 'summary.json') for name in RUNS}
    OUT.mkdir(parents=True, exist_ok=True)
    figures = OUT / 'figures'
    figures.mkdir(exist_ok=True)
    evidence = []
    records = {}
    table = []
    aggregate_calls = aggregate_invalid = 0
    for name, run in runs.items():
        fixed = ROOT / 'TestResults' / name / 'corrected-gameplay-metrics.json'
        results = read(fixed)['results'] if fixed.exists() else run['results']
        for result in results:
            game = result['game']
            log = ROOT / 'TestResults' / name / game / 'steps.jsonl'
            rows = [json.loads(line) for line in log.read_text(encoding='utf-8').splitlines()]
            decisions = [r for r in rows if r['event'] == 'decision']
            observations = [r for r in rows if r['event'] == 'observation']
            values = sorted(d['response']['latency_ms'] for d in decisions)
            invalid = sum(bool(d['executed']['invalid']) for d in decisions)
            idle = sum(not any(d['executed']['mouse']) and not any(d['executed']['steps']) for d in decisions)
            aggregate_calls += len(decisions)
            aggregate_invalid += invalid
            stats = {'calls': len(decisions), 'invalid': invalid, 'idle': idle,
                     'p50_ms': statistics.median(values) if values else None,
                     'p95_ms': values[math.ceil(len(values) * .95) - 1] if values else None,
                     'max_ms': max(values) if values else None}
            records[(name, game)] = (result, stats, observations, rows)
            table.append(f"| {name} | {NAMES[game]} | {len(decisions)} | {idle} | {invalid} | {stats['p50_ms']/1000:.2f} / {stats['p95_ms']/1000:.2f}초 | {'확인' if result['meaningfulGameplay'] else '미확인'} | {'달성' if result['objectiveMet'] else '미달성'} |")

    final = runs['model-gameplay-60']
    fort, _, fort_obs, _ = records[('model-gameplay-60', 'fortress-blue')]
    unguarded, _, _, _ = records[('model-gameplay-60', 'besiege')]
    siege, _, siege_obs, siege_rows = records[('model-besiege-guarded-30', 'besiege')]
    guarded_decisions = [row for row in siege_rows if row['event'] == 'decision']
    guard_modified = sum(bool(row['guard']['removedKeyGroups']) for row in guarded_decisions)
    guard_groups = sum(row['guard']['removedKeyGroups'] for row in guarded_decisions)
    play_observations = sum(row['telemetry']['mode'] == 'play' for row in siege_obs)
    health = final['modelHealth']
    shots = {}
    for game in NAMES:
        source = ROOT / 'TestResults' / 'model-gameplay-60' / game
        selections = [('start', '000-bootstrap.png'), ('final', 'final.png')]
        if game == 'besiege':
            selections.append(('first-action', '001-after.png'))
        for tag, filename in selections:
            dest = figures / f'{game}-{tag}.png'
            shutil.copy2(source / filename, dest)
            evidence.append({'image': dest.name, 'source': str(source / filename), 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
            shots[f'{game}-{tag}'] = dest
    # Preserve the short-charge example from the completed pilot as a distinct trial.
    for game, filename, tag in [('fortress-blue', '004-after.png', 'fortress-short-shot'), ('besiege', 'final.png', 'besiege-workshop-stall')]:
        source = ROOT / 'TestResults' / 'model-sampled-20' / game / filename
        dest = figures / f'{tag}.png'
        shutil.copy2(source, dest)
        evidence.append({'image': dest.name, 'source': str(source), 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
        shots[tag] = dest

    source = ROOT / 'TestResults/model-besiege-guarded-30/besiege/final.png'
    dest = figures / 'besiege-guarded-final.png'
    shutil.copy2(source, dest)
    evidence.append({'image': dest.name, 'source': str(source), 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
    shots['besiege-guarded-final'] = dest

    at = datetime.now(timezone(timedelta(hours=9))).isoformat(timespec='seconds')
    browser_errors = sum(len(run['errors']) for run in runs.values())
    report = f'''# GameScaling 소형 모델 기반 PlayHub 실제 플레이 QA 실험

- 작성 시각: {at} (KST)
- 실험 폴더: `{ROOT}`
- 대상 원본: `{final['projectRoot']}`
- 실행 방식: **실제 공개 모델의 화면 추론 + Chrome 입력 이벤트 + PlayHub 게임 상태 검증**

## 1. 결론

GameScaling-0.8B-S3를 이 PC의 CUDA GPU에서 구동하고 포트리스·비시즈에 실제 생성 입력을 전달했다. 총 **{aggregate_calls}회**의 게임 화면 추론을 기록했으며, 잘못되거나 잘린 액션은 **{aggregate_invalid}회**, 기록된 예상 외 브라우저 오류는 **{browser_errors}건**이다. 설치·추론 연결 성공과 게임 목표 달성은 별개로 판정했다.

포트리스 60회 실행은 파란 팀의 완료된 포격 **{fort.get('completedBlueVolleys', 0)}회**, 적 피해 **{fort.get('enemyDamage', 0)}**, 양 팀 합계 지형 제거량 **{fort.get('terrainRemoved', 0)}**를 기록했다. 비시즈는 작업장 복귀 입력을 제한한 30회 실행에서 최대 수평 이동 **{siege.get('maxHorizontalDistance', 0):.3f} 월드 좌표 단위**, 사격 **{siege.get('shots', 0)}회**, 파괴 목표 **{siege.get('destroyed', 0)}개**를 기록했다. 목표 판정은 포트리스 **{'달성' if fort['objectiveMet'] else '미달성'}**, 비시즈 **{'달성' if siege['objectiveMet'] else '미달성'}**이다. 비시즈 최종 결과는 아래에 명시한 **QA 시나리오 입력 제한을 적용한 결과**다.

이 결과는 짧은 로컬 실험이다. 현재 구성은 초 단위 추론을 기다리는 **시간 정지형 QA**이며, 논문의 실시간 Streaming-vLLM 성능을 재현한 것이 아니다. 범용 자율 게임 QA 도입 가능성이 입증됐다고 판단하지 않는다.

## 2. 환경과 고정 조건

| 항목 | 실제 구성 |
|---|---|
| 모델 | THUSI-Lab/GameScaling-0.8B-S3, 공개 CPT 체크포인트 |
| 추론 장치 | {health['gpu']['name']}, 약 8GB VRAM, `{health['device']}` / `{health['dtype']}` |
| 런타임 | 격리된 Python, CUDA PyTorch, Transformers 내장 모델 클래스 |
| 브라우저 | headless Chrome, 1280×800 게임 화면 |
| 모델 입력 | 640×360 경계 안으로 종횡비 유지 축소; 1280×800 입력은 576×360 |
| 최종 생성 설정 | temperature=1.0, top_p=1, top_k=0, seed=42, 최대 96 새 토큰, 직전 화면·액션 1개 |
| 출력 형식 | 비추론 prefill, 체크포인트 chat template, 액션 태그 보존, 멀티 토큰 종료 문자열 감지 |
| 게임 난수 | 실행기 seed=20261118; 실제 게임 설정은 각 `steps.jsonl`의 setup/config에 기록 |
| 실행 시간 | 결정당 6그룹 × 약 33.333ms. 게임 RAF를 60Hz로 전진시키며 추론 중 정지 |
| 외부 서비스 | 모델 API는 `127.0.0.1:8765`; PlayHub는 임시 loopback 포트·SQLite·Chrome 프로필 |

토스트·안내 메시지 등 UI 타이머는 실제 시간을 사용한다. 물리·발사 충전은 게임 프레임의 dt로 진행한다. 화면의 작은 노란 십자는 실행기가 표시한 현재 마우스 위치이며 모델에도 보인다. 화면 크기·문맥·샘플링을 고정했지만 GPU 부하와 UI 타이머까지 완전히 결정적으로 통제한 실험은 아니다. 다른 GPU 작업을 종료하지 않았으므로 지연 수치는 이 실행 환경의 관측값이다.

공개 모델 가중치의 다운로드 무결성을 검증했다. 모델 커스텀 코드는 실행하지 않았고, Transformers의 내장 모델 클래스를 사용했다. 설치 재현 자료는 실험 폴더에 보존했다.

## 3. 실험 설계와 판정

1. **연결 확인:** 공식 Doom 예제 화면으로 실제 추론. 모델은 `LB`를 생성했고 파싱에 성공했다. 이 검사는 게임에 입력을 적용하지 않았다.
2. **초기 실험:** temperature=0, history=0, 각 게임 3회. 두 게임의 6개 응답 모두 완전한 대기 액션이었다.
3. **작업장 포함 실험:** temperature=1, history=1, 각 게임 20회. 포트리스는 전투, 비시즈는 준비된 Rover의 작업장에서 시작했다.
4. **플레이 상태 확장 실험:** 각 게임 최대 60회. 비시즈는 준비 단계에서 실행기가 시뮬레이션을 시작했고, 그 이후의 입력을 모델에 넘겼다. **비시즈 출격을 모델 성과로 세지 않는다.**
5. **비시즈 수정 후 재실험:** 최신 Web 파일로 30회 실행. 전투 시작 시나리오에 한해 `Space`를 제거하는 `-GuardPlayMode` 옵션을 사용했다. 이동·조준·발사는 모델이 생성하며 실행기가 추가하지 않는다. 이 결과는 제한 없는 모델 실행과 구분한다.

포트리스 준비는 Classic, Highlands, 1대1, 파란 Catapult 대 빨간 Cannon, 쉬움 AI, 60초 턴 제한이다. 비시즈는 Outpost와 기본 Rover를 사용한다. 모델에는 게임 화면과 고정된 규칙·조작법·목표만 제공했다. 내부 상태와 HP·위치·탄 수는 결과 판정에만 사용했으며 모델 입력으로 보내지 않았다.

- 포트리스의 기본 조작 확인: 파란 팀 발사체 또는 완료된 파란 팀 포격을 관측. 시나리오 목표: 모델의 포격으로 적에게 피해를 줌.
- 비시즈의 기본 조작 확인: 모델 조작 중 사격·목표 파괴, 또는 이동 입력과 0.15를 넘는 수평 위치 변화. 시나리오 목표: Outpost 목표 파괴 완료.
- 잘린 출력·잘못된 액션은 6개 빈 키 그룹으로 처리한다. 키를 놓는 동작은 충전 중인 발사를 해제할 수 있어 입력 전후 키 상태도 기록한다.
- 종료 시 안전한 키 해제 결과는 별도 로그로 남기며 모델 성과에 포함하지 않는다.

## 4. 정량 결과

대기 횟수는 **실제 적용한 액션에서 마우스 이동·스크롤·키 입력이 모두 0인 결정**만 센다. 키가 비어 있어도 마우스를 움직인 응답은 대기로 세지 않는다. 입력 제한 실행에서는 Space 제거 후 빈 입력도 포함한다. P95는 관측값을 정렬한 뒤 nearest-rank 방식으로 계산했다. 이 표의 지연은 서버 측 이미지 처리·생성·파싱 시간이며 네트워크·캡처·게임 실행 전체 시간은 아니다.

| 실행 | 게임 | 추론 수 | 완전 대기 | 무효 액션 | 지연 중앙값 / P95 | 기본 조작 | 목표 |
|---|---|---:|---:|---:|---|---|---|
{chr(10).join(table)}

포트리스 60회 실행의 게임 진행 시간은 **{fort.get('simSeconds', 0):.3f}초**다. 비시즈의 최대 관측 시뮬레이션 경과 시간은 제한 없는 실행 **{unguarded.get('simSeconds', 0):.3f}초**, 수정 후 실행 **{siege.get('simSeconds', 0):.3f}초**다. 비시즈는 작업장 복귀 시 시뮬레이션이 초기화되므로 이 값은 여러 출격의 합산 시간이 아니다. 장시간 안정성·전체 게임 클리어·회귀 QA 범위까지 검증한 것은 아니다.

각 실행은 시작 시점의 최신 게임 Web 파일을 임시 PlayHub 환경에 복사해 사용했다. 이 리포트에서는 게임 버전 차이 비교를 생략한다. 수정 대상은 실험 실행기이며 PlayHub 제품 원본은 이 실험에서 변경하지 않았다.

초기 20회 실행의 `shotsBlue` 집계는 전역 `stats.shots`를 팀별 배열로 잘못 읽는 문제가 있었다. 원본 기록을 그대로 보존하고 완료된 `lastAction.volleyId`와 소유 팀을 기준으로 재집계했다. 이 리포트는 {link('수정된 집계', ROOT / 'TestResults/model-sampled-20/corrected-gameplay-metrics.json')}를 사용한다. 전체 발사체 수에는 상대 AI의 발사도 포함되므로 모델 발사 횟수로 해석하지 않는다.

## 5. 포트리스 증거

최종 확장 실행의 시작 상태. 준비 이후의 키·마우스 입력은 모델 출력이다.

![포트리스 확장 실행 시작](<{shots['fortress-blue-start'].as_posix()}>)

20회 파일럿의 4번째 결정 뒤. 첫 결정은 Space를 한 그룹만 누르고 해제했다. 엔진의 완료 액션은 power=2, 적 피해=0, 지형 제거=1354로 기록됐다. 이 이미지는 발사·지형 반응의 증거이며 적 명중 성공 증거가 아니다.

![포트리스 짧은 충전 후 지형 변화](<{shots['fortress-short-shot'].as_posix()}>)

최종 확장 실행의 마지막 관측 화면. 내부 상태의 적 피해와 목표 판정을 함께 확인해야 한다.

![포트리스 최종 관측](<{shots['fortress-blue-final'].as_posix()}>)

## 6. 비시즈 증거

20회 파일럿 종료 화면. 모델은 작업장에서 입력을 시도했지만 출격하지 못했다. 이 실패를 보존한 뒤 플레이 상태를 따로 검증했다.

![비시즈 작업장 정체](<{shots['besiege-workshop-stall'].as_posix()}>)

최종 확장 실행의 시작 화면. **시뮬레이션 시작은 실행기의 준비 조작**이며 이후 주행·사격 입력만 모델이 생성했다.

![비시즈 플레이 상태 준비 완료](<{shots['besiege-start'].as_posix()}>)

첫 모델 입력은 Space를 한 그룹 누르는 것이었고, 게임은 작업장으로 돌아갔다. 즉 출격 준비를 해 줘도 모델이 플레이 상태를 유지하지 못한 사례다. 원본 응답과 첫 observation의 `mode`를 함께 보존했다.

![비시즈 첫 모델 입력 뒤 작업장 복귀](<{shots['besiege-first-action'].as_posix()}>)

입력 제한 없는 60회 실행의 최종 관측 화면. 최대 수평 이동 {unguarded.get('maxHorizontalDistance', 0):.3f}, 사격 {unguarded.get('shots', 0)}회, 목표 파괴 {unguarded.get('destroyed', 0)}개였다.

![비시즈 최종 관측](<{shots['besiege-final'].as_posix()}>)

### 바로 적용한 수정과 재검증

`-BesiegeStart play -GuardPlayMode`는 비시즈의 `Space` 키만 제거해 전투 시나리오를 유지하도록 제한한다. 기본값은 비활성이며 포트리스에는 적용하지 않는다. 마우스 클릭까지 막지는 않는다. 원본 응답(`response`), 검증된 원본 액션(`validated`), 적용 액션(`executed`), 제거 이유와 그룹(`guard`)을 모든 결정에 남긴다. 모델에 새 이동·발사 입력을 만들어 주거나 모델 자체를 학습한 수정이 아니다.

서버의 직전 액션 문맥에는 모델이 생성한 원본 응답이 남고, 다음 화면은 제한된 입력을 적용한 결과다. 이 때문에 제한 없는 정책 평가와 동일한 조건으로 해석할 수 없다.

30회 실행 중 **{guard_modified}개 결정 / {guard_groups}개 입력 그룹**에서 Space를 제거했다. 실행 후 관측 **{len(siege_obs)}개 중 {play_observations}개**가 플레이 상태였다. 기본 조작 판정은 **{'확인' if siege['meaningfulGameplay'] else '미확인'}**, 목표는 **{'달성' if siege['objectiveMet'] else '미달성'}**이다. 이 옵션의 효과는 작업장 토글 제한이며, 다른 게임이나 전체 자율 QA 성공으로 일반화할 수 없다.

![비시즈 입력 제한 후 최종 관측](<{shots['besiege-guarded-final'].as_posix()}>)

## 7. 검증 범위와 해석

- 추론 서버: 오프라인 입력·HTTP·종료·샘플링 테스트 7개 통과. 이 테스트의 모의 생성은 실제 게임 실행 결과에 포함하지 않았다.
- 공개 GameScaling 클라이언트: 공식 오프라인 테스트 14개 통과.
- 브라우저 입력 실행기: 무효 액션, 연속 키 유지·해제, 좌표 변환, 팀별 포격 집계, 출격 준비 구분, Space 제한과 원본 보존 테스트 7개 통과.
- 포트리스: 기존 엔진 검사 29항목 통과. 비시즈: 현재 Web 모듈을 임시 dist로 배치해 기존 엔진 테스트 88개 통과. 이는 모델 플레이 성공과 별도다.
- 새 임시 계정의 저장 슬롯 부재에 따른 `/api/saves/<game>?slot=main` 404는 예상된 초기 상태로 별도 기록했다. 이 항목을 게임 오류에 합산하지 않았다.
- GPU에서 생성했고 CPU 대체 추론은 이 실행에 사용하지 않았다. 공식 Gamer Streaming-vLLM이나 미공개 SFT/RL 체크포인트를 설치한 것은 아니다.

관측된 주요 한계는 대기 출력, 짧은 충전, 작업장 진입 처리와 목표 지향 제어다. 유효한 액션 문자열을 얻는 것만으로 QA를 통과시키면 이 실패들을 놓친다. 실용 도입 판단에는 목표 도달·명중·저장·오류 상태를 별도 단언하는 테스트가 필요하다. 이번 결과는 연결 가능성과 작은 모델의 한계를 확인하는 탐색 실험으로 사용한다.

## 8. 재실행

첫 PowerShell 창에서 추론 서버를 실행한다. 모델과 의존성이 없을 때만 먼저 `Setup-Inference.ps1`을 실행한다.

```powershell
Set-Location D:\\Github\\Experiments\\Gamer
.\\Run-Inference.ps1 -Temperature 1.0 -Seed 42 -HistoryFrames 1
```

두 번째 창에서 새 실행 이름으로 QA를 실행한다. 같은 실행 폴더는 덮어쓰지 않는다.

```powershell
Set-Location D:\\Github\\Experiments\\Gamer
.\\Smoke-Inference.ps1
.\\Run-ModelQA.ps1 -Game all -Steps 60 -BesiegeStart play -RunId model-qa-repeat-01
.\\Run-ModelQA.ps1 -Game besiege -Steps 30 -BesiegeStart play -GuardPlayMode -RunId model-qa-guarded-repeat-01
```

`-BesiegeStart workshop`은 작업장부터 시작하는 별도 시나리오다. 실행기는 기본 조작 자체가 관측되지 않거나 오류가 발생하면 종료 코드 1을 반환한다. 종료 코드 0도 게임 목표 달성·클리어를 뜻하지 않으므로 `objectiveMet`을 확인한다. 테스트 브라우저·임시 DB·서버는 종료 시 정리된다.

## 9. 원본 증거와 출처

'''
    for name in RUNS:
        run_dir = ROOT / 'TestResults' / name
        report += f'- **{name}**: {link("실행 조건", run_dir / "run.json")}, {link("집계", run_dir / "summary.json")}\n'
        for game in [result['game'] for result in runs[name]['results']]:
            report += f'  - {NAMES[game]}: {link("입력·모델 응답·상태 JSONL", run_dir / game / "steps.jsonl")}, {link("모델 프롬프트", run_dir / game / "system-prompt.txt")}\n'
    report += f'''
- {link('예제 실제 추론 응답', ROOT / 'TestResults/inference-smoke.json')}
- {link('추론 서버 로그', ROOT / 'TestResults/inference-server-sampled.log')}
- 테스트 로그: {link('추론 서버 7개', ROOT / 'TestResults/inference-server-tests.log')}, {link('입력 실행기 7개', ROOT / 'TestResults/model-adapter-tests.log')}, {link('공식 클라이언트 14개', ROOT / 'TestResults/core-tests.log')}, {link('포트리스 엔진 29항목', ROOT / 'TestResults/game-unit-fortress-blue.log')}, {link('비시즈 엔진 88개', ROOT / 'TestResults/game-unit-besiege-canonical-web.log')}
- {link('스크린샷 원본·해시 매핑', OUT / 'evidence-manifest.json')}
- [GameScaling 0.8B S3 모델 카드](https://huggingface.co/THUSI-Lab/GameScaling-0.8B-S3)
- [공식 GameScaling 클라이언트](https://github.com/THUSI-Lab/GameScaling)
- [Gamer 논문](https://arxiv.org/abs/2611.18397), [프로젝트 페이지](https://mihoyo-gamer.github.io/), [GitHub](https://github.com/RainBowLuoCS/Gamer), [Hugging Face 논문 페이지](https://huggingface.co/papers/2611.18397)
- [Transformers Qwen3.5 모델 문서](https://huggingface.co/docs/transformers/model_doc/qwen3_5)

공개 모델 카드의 라이선스는 Apache-2.0이며 다운로드한 LICENSE를 보존했다. 게임 이미지·상표 등 제3자 자산의 권리는 별개다. 이 리포트의 스크린샷은 지정된 로컬 PlayHub QA 실행에서 캡처한 증거이며 외부 배포용 게임 자산 패키지가 아니다.
'''
    (OUT / 'REPORT.md').write_text(report, encoding='utf-8')
    (OUT / 'evidence-manifest.json').write_text(json.dumps({'created_at': at, 'images': evidence}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(OUT / 'REPORT.md')

if __name__ == '__main__':
    main()
