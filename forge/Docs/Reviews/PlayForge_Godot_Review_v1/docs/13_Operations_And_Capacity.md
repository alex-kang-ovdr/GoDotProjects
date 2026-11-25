# 13 · 운영·서버 리소스·패키지·요금제 영향

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 재사용으로 줄어드는 개발 비용과 실행 원가는 별개

Godot의 라이선스 비용과 운영 CPU/RAM/스토리지/AI 비용은 분리해서 판단한다. 엔진 도입 후 서버 밀도가 이전 자체 엔진의 가정과 같아질 것이라고 계산하지 않는다.

| 실행 | 로컬 자원 | 서버 작업 |
|---|---|---|
| 일반 웹 편집 | UI·Scene/Godot Web preview | 협업 명령·내구성·권한 |
| Local PIE | GDScript·Physics·Renderer | Snapshot 제공·선택적 검증 |
| Listen PIE | Host Authority·표현 | 인증·매칭·필요 시 연결 중계 |
| Dedicated PIE | 각 Client 표현 | 시험 서버 World·복제 |
| 자동 시각 테스트 | 테스트 브라우저 CPU/GPU | Worker 실행·아티팩트 수집 |
| 공개 Dedicated | Client 예측·화면 | 실제 Authority·저장·복제 |

브라우저 Listen은 네이티브 리슨과 같은 소켓 환경이 아니다. 브라우저 지원 전송과 연결 정책을 별도 검증한다. [G06](../references/Verified_Sources.md#g06)

## P0 프로세스 정책

LibGodot를 필수로 사용하지 않고 Export Template 기반 Dedicated 프로세스로 시작한다. headless 서버는 편집기 바이너리와 불필요한 Client Resource를 제외한다. [G32](../references/Verified_Sources.md#g32)

처음에는 한 Room 또는 한 신뢰 경계별 프로세스를 사용한다. 이후 동일 Release의 여러 Room을 묶을 때 전역 설정·Autoload·Resource cache·물리 서버·스크립트 상태 간 오염을 검증한다. 비용 절감 수치 없이 밀도를 먼저 고정하지 않는다. [G22](../references/Verified_Sources.md#g22)[G20](../references/Verified_Sources.md#g20)

## 측정 단위

프로세스 CPU 시간/RSS/네트워크는 직접 측정값, World별 메모리는 attributed estimate일 수 있다. 공유 리소스를 각 World에 중복 합산하지 않는다. CPU tick wall time과 모든 worker의 누적 CPU time을 나누어 기록한다.

```text
동시 세션 수 = 지역·게임·모드별 실제 점유를 반영해 집계
평균 CPU 수요 = 관측 누적 CPU seconds / 관측 wall seconds
배치 가능 Room 수 = CPU·RAM·Tick 지연·격리 조건 중 가장 작은 한도
총 자원 = 활성 Room + 프로세스 고정 비용 + 예비·관리 오버헤드
```

평균 CPU만으로 용량을 확정하지 않고 P95/P99 tick, initial replication burst, spawn/cell activation, 재접속 폭주를 포함한다. 대기열 과부하 시 시험 Pool을 줄이되 공개 게임 서버를 잠식하지 않는다.

## 패키지 용량 실험

빈 프로젝트, 2D GDScript 예제, 3D 예제 각각에 대해 다음을 기록한다.

| 지표 | 의미 |
|---|---|
| template_bytes | 엔진 공통 실행 파일·WASM |
| content_bytes | 게임 전용 cooked resource·GDScript |
| transfer_bytes | 압축 전송 크기 |
| install_bytes | 설치 후 디스크 크기 |
| source_archive_bytes | 원본·Import 설정·필요 파일 |
| billed_bytes | 승인된 상품 집계 규칙 결과 |

Godot 바이너리를 어느 방법으로 배포하느냐에 따라 과금 기준을 자동 바꾸지 않는다. Free 배포 50 MB·Pro 100 MB를 만족하지 못하면 모듈 제거·재사용·정책 변경 제안을 각각 구분한다. 측정 전 크기 수치를 만들지 않는다.

## 클라우드 저장

Free 제작 100 MB/3개, Pro 제작 1 GB/개수 제한 없음은 계정 소유 프로젝트 합산이다. 동일 파일 버전은 스냅샷마다 중복 차감하지 않고, 자동 저장 설정과 협업 명령의 내구성은 분리한다. Godot imported cache는 원본이 아니며 재생성 가능한 시스템 캐시로 관리한다.

Source Bundle에 필요한 원본과 외부 패키지는 버전 고정한다. 공유 Registry에서 미사용 버전을 정리하더라도 보존 중인 Release의 재구성 입력을 지우지 않는다. 과거 코드·에셋을 AI 분석 로그로 중복 장기 보존하지 않는다.

## 플랫폼 AI 비용

Free 체험권과 Pro 주간 AI 수치는 미정이다. Godot 도입 효과 평가에서 모델 호출 시간, 도구 왕복, import/cook, PIE 시작, 서버 CPU·네트워크를 모두 기록한다. 더 빠른 렌더러 때문에 도구 호출 수가 자동 감소했다고 추정하지 않는다.

## 운영 통과 조건

동일 snapshot을 Local PIE·Dedicated PIE·공개 runtime에서 실행해 기능 일치를 확인한다. 각 프로필의 실패가 다른 프로젝트의 작업 저장을 손상시키지 않아야 한다. 라이선스·보안 검증 없는 캐시 산출물을 다른 tenant가 재사용하지 못하게 한다.
