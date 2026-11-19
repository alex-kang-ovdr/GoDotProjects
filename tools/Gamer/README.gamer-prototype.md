# Gamer / PlayHub 모델 플레이 QA

Windows에서 공개 GameScaling-0.8B-S3 체크포인트를 Transformers와 CUDA로 실행하고, PlayHub의 Fortress War와 Ironwood: Siege Workshop(Besiege)을 실제 Chrome 입력으로 테스트한다. 실험은 원본 게임 파일과 모델 가중치를 그대로 사용한다. [개선 실험 보고서](Reports/2026-11-18-improved-model-qa/REPORT.md) · [기존 플레이 QA 보고서](Reports/2026-11-18-model-qa/REPORT.md)

- 포트리스 `guided` 모드는 모델이 물리 계산으로 얻은 발사 지시를 받아 첫 결정에서 `Space`를 약 0.533초간 누른 뒤 놓았다. 모델 응답의 키 입력을 교체하지 않았고, 적 HP가 880에서 572로 줄었다. 새 게임에서 같은 결과를 재현했다.
- 비시즈 `model` 모드에 전투 지시를 추가하자 모델 입력 8회에서 5발을 쏴 목표 3/9개를 파괴했다. 작업장 복귀 제한을 켰지만 모델 입력을 걸러낸 횟수는 0회였다. `guided` 모드에서는 모델이 첫 입력에 `Space`를 눌러 작업장으로 돌아갔다.
- 비시즈 `hybrid` 모드는 모델 응답 4회를 모두 제어기가 계산한 입력으로 교체했다. 제어기 입력으로 3발을 쏴 목표 9/9개를 파괴했고, 코어 HP 100으로 승리했다. 새 게임에서 사격 3회와 목표 9/9개 파괴를 재현했다.

## 로컬 추론 서버

처음 한 번 PowerShell에서 추론 환경을 준비한다. 설치 스크립트는 `.venv-inference`에 CUDA PyTorch와 Transformers를 설치하고 `models/GameScaling-0.8B-S3`의 공개 가중치 SHA-256을 확인한다. 설치된 패키지는 `requirements-inference.lock.txt`에 기록한다.

```powershell
Set-Location D:\Github\Experiments\Gamer
.\Setup-Inference.ps1
```

추론 서버를 실행한 터미널은 QA가 끝날 때까지 열어 둔다. 아래 명령은 개선 실험과 같은 CUDA 장치 설정, 샘플링 시드, 직전 화면 1장 기록, 960×600 이미지 상한을 사용한다.

```powershell
.\Run-Inference.ps1 -Device cuda -Temperature 1 -Seed 42 -HistoryFrames 1 -MaxWidth 960 -MaxHeight 600
```

별도 PowerShell에서 공개 Doom 예제 이미지로 추론과 액션 파싱을 확인한다. 이 스크립트는 게임을 띄우지 않는다.

```powershell
Set-Location D:\Github\Experiments\Gamer
.\Smoke-Inference.ps1
```

서버는 `http://127.0.0.1:8765`에서 `GET /health`로 모델·장치·실행 설정을, `POST /act`로 스크린샷에 대한 원본 응답과 파싱한 마우스·키보드 입력을 반환한다. `instruction`은 현재 턴에 추가할 지시이며, `previous_action`은 같은 에피소드에서 직전에 실행한 입력이다. 기록을 사용하는 서버는 `previous_action`으로 직전 모델 응답을 교체해 실제 플레이를 문맥에 반영한다. 스모크 결과는 `TestResults/inference-health.json`과 `TestResults/inference-smoke.json`에 저장된다.

## PlayHub에서 실행

```powershell
.\Run-ModelQA.ps1 -Game fortress-blue -Controller guided -Steps 4 -StopOnObjective -RequireObjective
.\Run-ModelQA.ps1 -Game besiege -Controller hybrid -BesiegeStart play -Steps 6 -StopOnObjective -RequireObjective
```

`playhub-target.json`에 지정한 체크아웃의 게임을 임시 PlayHub에서 실행한다. 하네스는 화면과 포인터를 캡처해 모델에 보내고, 모델이 응답하는 동안 게임 프레임을 멈춘다. `-StopOnObjective`는 포트리스에서 적에게 피해를 주거나 비시즈에서 목표 파괴를 완료하면 실행을 끝낸다. `-RequireObjective`를 켜면 목표에 도달해야 명령이 성공한다.

- 기본 `model` 모드는 모델이 생성한 입력을 실행한다. `-Guidance combat`을 추가하면 현재 게임 상태에 따른 전투 지시도 보낸다.
- `guided` 모드는 게임 상태와 물리 계산에서 얻은 계획을 입력 순서와 지속 시간으로 모델에 설명한다. Chrome은 모델이 응답한 키보드·마우스 입력을 계획의 지속 시간에 맞춰 적용한다.
- `hybrid` 모드는 매 결정의 모델 응답을 기록하고, 게임 상태에서 제어기가 계산한 입력을 Chrome에 적용한다.

Besiege에서 `-BesiegeStart play`는 하네스가 출격한 상태에서 모델 조작을 시작한다. 기본 `workshop`에서는 모델이 출격을 결정한다. `-GuardPlayMode`는 `play` 시작에서만 사용하며, 하네스가 작업장 복귀용 `Space` 키만 걸러낸다. 출격과 키 제한은 QA 조건으로 기록된다. 모델 원본 응답, 검증한 입력, 실행한 입력, 걸러낸 키는 각 판단 로그에서 확인할 수 있다.

실행별 `TestResults/<run-id>/`에 `run.json`, 집계 `summary.json`, 게임별 `steps.jsonl`과 스크린샷이 남는다. `steps.jsonl`의 `response`, `executed`, `assistance`에서 모델 원본 응답, 실행 입력, 계획과 적용 여부를 확인할 수 있다. 종료 코드가 0이 아니면 집계에서 목표 달성 여부와 실행 오류를 확인한다.

## 검증 도구

```powershell
.\Verify-Client.ps1                # 공식 클라이언트의 의존성, 오프라인 파서와 예제
.\Verify-PlayHub.ps1               # 게임 규칙, 포털 계약, 저장 흐름
.\Verify-PlayHub.ps1 -Browser      # 임시 PlayHub와 match3-garden 브라우저 스모크
& .\.venv-inference\Scripts\python.exe -m unittest test_inference_server
& .\runtime\node-v24.22.3-win-x64\node.exe --test .\playhub_model_qa.test.mjs .\fortress_planner.test.mjs .\besiege_planner.test.mjs
```

추론 서버 테스트 10개와 하네스·제어기 테스트 11개가 통과했다. 기존 PlayHub 규칙·저장 테스트와 브라우저 스모크는 모델 서버 없이 실행된다. 공식 클라이언트 예제는 한국어 Windows에서 UTF-8 파일을 읽을 수 있도록 실행기에 `-X utf8`을 적용했다.

공개 GameScaling 체크포인트에는 Gamer 논문에서 설명한 전체 학습 정책이 포함되어 있지 않다. 실시간 추론 엔진 Streaming-vLLM의 구현과 설치 방법도 공개되지 않았다. [Gamer 공식 저장소](https://github.com/RainBowLuoCS/Gamer) · [GameScaling](https://github.com/THUSI-Lab/GameScaling) · [공개 체크포인트](https://huggingface.co/THUSI-Lab/GameScaling-0.8B-S3)
