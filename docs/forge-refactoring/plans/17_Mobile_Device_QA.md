# 17. 모바일 실기기 자동화·GPU 호환성·성능 회귀 체계

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-17 / 2026-11-24 |
| 원문 연결 | PDF 5, 7, 9-10쪽: Mali/Adreno, 테스트 팜, 실기기 출시 검증 |
| 우선순위 / 상태 | P0 / 개발 계획, 기기 실행 검증 미수행 |
| 구현 위치 | 공용 QA runner, 장치 farm adapter, Godot 테스트 addon |
| 담당 | QA 자동화, Android/iOS 담당, 성능 엔지니어 |
| 예상 공수 | 12-20 PW; 1 PW = 숙련 담당자 5근무일, 장비 조달 제외 |
| 선행 / 연계 | 16 재현 빌드, 13 심볼; 18 SDK·입력, 27 네트워크, 28 서버 |

## 1. 목표와 범위

대표 모바일 기기군에서 설치·부팅·입력·배경 전환·네트워크 복귀·과금 sandbox·성능의 회귀를 출시 전에 검출한다. 에뮬레이터는 빠른 기능 검증에 사용하고 GPU/발열/메모리 판정은 실기기로 수행한다.

개별 게임의 테스트 시나리오는 각 프로젝트가 소유하고, 공용 runner와 기록 형식만 공유한다. 게임별 성능 목표와 대표 장면은 엔진 통합 팀이 일률적으로 정하지 않는다.

## 2. 확인된 사실과 원문 보정

Firebase 공식 문서는 Test Lab의 실기기·CI 연동을 설명하며 backend 부하 시험 용도로 사용하지 말라고 명시한다. 서버 CCU 검증은 28의 별도 부하 환경으로 분리한다. [Test Lab 문서](https://firebase.google.com/docs/test-lab)

확인 당시 공식 이전 안내에는 Test Lab이 deprecated이며 2027-09-30 종료 예정, 후속 Developer Device Platform은 preview로 표시된다. 특정 무료 quota나 영구적인 서비스 존속을 전제로 투자하지 않는다. [공식 이전 안내](https://firebase.google.com/docs/test-lab/migrate)

아래 QA 구조·기기 수·성능 임계값은 자체 제안이다. 원문의 특정 출시작 crash 비율을 모든 Godot 프로젝트의 기본 품질로 사용하지 않는다.

## 3. 기기·시나리오 선정

| 계층 | 최초 제안 | 주기 | 목적 |
|---|---|---|---|
| PR smoke | 로컬 Android 1대, iPhone 1대 | 변경마다 | 설치·부팅·기본 입력 |
| Nightly | Mali 2대, Adreno 2대, iPhone 2대 | 야간 | 렌더링·메모리·SDK 조합 |
| Release | 실제 타깃 분포에서 8-12개 조합 | RC마다 | OS/GPU/해상도/저장 공간 확대 |
| 장시간 | 각 OS 최소 1대 | 주간·중요 변경 | 발열, 누수, 백그라운드 반복 |

장치 수는 초기 예산 가정이며 보유 장비 확인 후 조정한다. Galaxy/iPhone처럼 모델 이름만 저장하지 않고 SoC, GPU, driver, OS build, RAM, 배터리·온도 상태를 기록한다. 동일 브랜드 안에서도 GPU가 다르면 별도 조합이다.

## 4. 실행 아키텍처

`TestCoordinator`가 빌드 manifest와 시나리오를 읽고 `DeviceFarmProvider`를 통해 장치를 예약한다. 로컬 USB/Wi-Fi 장치와 외부 farm은 같은 결과 계약을 반환한다. 디바이스를 공유해도 프로젝트 토큰·저장 데이터는 매 실행 초기화한다.

게임 안의 QA addon은 scene entry·입력 action·논리 상태 검증을 수행한다. 화면 좌표 클릭만으로 성공 여부를 판정하지 않는다. OS 권한·스토어 UI·background 등 외부 동작은 플랫폼 automation adapter가 맡는다.

실패 영상은 실패 전후의 제한 구간만 보존한다. 원인 분리에 필요한 프레임타임·오류 로그·build ID·seed를 함께 저장하고 화면 속 테스트 계정 정보는 검토용 자료에서 제거한다.

## 5. 제안 스키마와 API

```yaml
# 자체 제안: QA 플랫폼 계약, Godot 내장 API 아님
run:
  project_id: project-A
  build_id: immutable-build-id
  scenario_id: purchase_resume_v1
  device_profile: android_mali_low
  seed: 17001
  warmup_seconds: 120
  sample_seconds: 600
  repeats: 3
  renderer_profile: mobile_low
  network_profile: rtt80_loss1
  expected_state: entitlement_granted_once
```

제안 provider API는 `reserve(profile)`, `install(artifact)`, `execute(scenario)`, `collect(run_id)`, `reset()`이다. 장치 부재, 앱 결함, 네트워크 불가, quota 초과, farm 장애를 서로 다른 상태 코드로 기록한다.

## 6. 시나리오 팩

1. Cold/warm start, 첫 리소스 import 유무, shader 준비·first frame 지연.
2. 2D UI/3D lighting/terrain/animation/particle 대표 장면의 golden comparison.
3. 멀티터치 이동+공격, 화면 회전, safe area, 키보드·controller 전환.
4. 잠금·통화 interruption·background 30회, 메모리 압박 후 복구.
5. Wi-Fi↔모바일 전환, 접속 끊김, 세션 복귀, 중복 login 처리.
6. Sandbox IAP 성공·보류·취소·복원, 광고 callback 중 앱 중단.
7. 30분 thermal soak, 2시간 memory soak, 저장 공간 부족 설치.

Crash-free 비율은 반복 시험과 실서비스 지표를 별도로 저장한다. 기능 시험 100회 무사고를 실사용자 crash-free 99%라고 바꾸어 표기하지 않는다.

## 7. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| Q17-1 | 기기 조사·대표 장면·성능 예산 정의 | 1-2 | device matrix, 프로젝트별 예산 |
| Q17-2 | QA addon·입력 재생·상태 assertion | 3-5 | 자동 시나리오 executor |
| Q17-3 | 로컬 farm와 cloud provider adapter | 2-4 | 예약·설치·정리·비용 상한 |
| Q17-4 | 성능·crash·영상·심볼 수집 | 2-3 | 공통 결과와 증거 묶음 |
| Q17-5 | SDK/수명주기/네트워크 회귀 팩 | 3-4 | 7개 시나리오 팩 |
| Q17-6 | Release gate·운영 인수 | 1-2 | 대시보드, 재현·예외 정책 |
| 합계 | 장치·클라우드 사용료 별도 | **12-20** | 실기기 검증 기반 |

## 8. 단계와 의존성

첫 단계는 소유한 Android/iPhone에서 재현 가능한 실패 하나를 자동 검출한다. 다음 단계에서 nightly 확대와 baseline 비교를 추가한다. 외부 farm는 장치 범위가 부족할 때 adapter로 연결한다.

13의 심볼 저장소가 준비되기 전에는 native crash를 주소 목록으로만 수집하므로 release gate를 완료로 판정하지 않는다. 렌더러·SDK·엔진을 한 번에 올리지 않고 변경 축별 실험으로 원인을 격리한다.

## 9. 정량 완료 기준

| 항목 | 재현 조건 | 목표 |
|---|---|---|
| 신뢰성 | 정상 빌드 100회 반복, 동일 장치 상태 | 테스트 인프라 원인 false failure 2% 이하 |
| 결함 검출 | 의도적으로 crash·입력 역전·영수증 중복 주입 | 사전 정의 10종 모두 검출 |
| 성능 회귀 | warmup 2분 후 10분 × 3회 | p95 CPU/GPU 프레임 각각 baseline +10% 경보 |
| Thermal | 같은 밝기·충전 조건, 30분 | 말미 10분 목표 FPS 유지 여부를 별도 판정 |
| 누수 | 장면 로드/종료 100회, 2시간 | 반복 후 RSS 증가율 10% 초과 시 분석 gate |
| 복귀 | background/네트워크 변경 각 30회 | crash 0, 중복 지급 0, 세션 상태 복원 |
| 재현 | 실패 run을 다른 담당자가 재실행 | 10건 중 9건 이상 동일 실패 또는 원인 식별 |

성능 경보가 곧 회귀 확정은 아니다. 온도·OS 업데이트·driver 변화부터 분리한다. 확률적 crash는 재실행 성공만으로 해소 처리하지 않는다.

## 10. 위험·대체 경로

외부 farm 종료·가격 변경·preview 제약은 provider 교체와 로컬 baseline으로 대응한다. 2주 내 원하는 GPU 조합을 확보하지 못하면 지원표에 미검증으로 표시하고 최소 지원 기기를 보수적으로 고정한다.

Test Lab이나 후속 장치 서비스에서 대규모 CCU를 발생시키지 않는다. 2기기 멀티플레이 기능 검증과 서버 부하는 목적·계정을 분리한다. 제품 성능과 자동화 인프라 비용에 각각 월간 상한을 둔다.

## 11. 제출 산출물·출처

산출물은 device matrix, 시나리오 소스, 결과 JSON schema, 증거 보존 규칙, baseline 보고서, RC 판정표다. 실제 측정 보고서는 구현 이후 생성한다.

확인일: 2026-11-24.

- [Firebase Test Lab 기능과 사용 범위](https://firebase.google.com/docs/test-lab)
- [Developer Device Platform 이전 안내](https://firebase.google.com/docs/test-lab/migrate)
- [Godot CLI](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html): 자동 실행 기반.
