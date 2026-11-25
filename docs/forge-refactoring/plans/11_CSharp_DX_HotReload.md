# 11. C# 개발 경험·안전한 핫리로드·IDE 통합 개발 계획

## 1. 계획 요약

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | IMP-11 / 2026-11-24 |
| 원문 대응 | PDF 4쪽 C# 도구·리로드, 9쪽 IDE·Hot Reload 보완 |
| 우선순위 | P2. C#을 사용하는 프로젝트에 선택 적용 |
| 구현 위치 | EditorPlugin, IDE 설정 템플릿, 상태 복구 어댑터, 테스트 harness |
| 선행 과제 | 16 빌드 프로파일, 13 계측. 10 신규 바인딩 전환은 필수 아님 |
| 담당 | C# 도구 엔지니어 1명, 편집기 엔지니어·QA 부분 투입 |
| 예상 공수 | 14-24 PW. IDE 라이선스·외부 회신 대기는 제외 |
| 구현 상태 | 개발 계획. 실제 IDE 연결·리로드 테스트 미수행 |

## 2. 목표와 범위

C# 사용자가 수정 → 빌드 → 플레이 상태 확인을 반복할 때 재시작 비용을 줄이고, 실패 시 에디터·프로젝트 상태가 깨지지 않도록 한다. GDScript 기본 개발 흐름을 유지하고 C# 프로젝트에만 도구를 설치한다.

기존 IDE 핫리로드를 먼저 검증한다. 추가 개발은 수정 유형 분류, 안전 지점, 상태 캡처·복구, `[Tool]` 스크립트 격리, 코드 위치와 프로파일 데이터 연결에 집중한다. 런타임마다 가능한 수정 범위가 다르므로 모든 필드·타입 변경의 무중단 반영을 약속하지 않는다.

## 3. 확인된 기능과 보정

- Rider 공식 문서는 Godot 프로젝트의 C#/GDScript 디버깅·프로파일링·LSP/DAP 통합을 안내한다. 기존 연결 기능을 재구현하기 전에 검증한다. [Godot support](https://www.jetbrains.com/help/rider/Godot.html)
- Rider 2025.1 변경 기록에는 Godot C# 프로젝트에서 breakpoint로 정지한 상태의 Hot Reload 지원이 명시되어 있다. “Godot에서 C# 핫리로드가 전혀 불가능”하다고 해석하지 않는다. [공식 변경 기록](https://www.jetbrains.com/rider/whatsnew/2025-1/)
- Hot Reload에는 수정 종류·대상 .NET·디버그 모드별 제한이 있다. 이를 Godot 객체·scene·signal의 상태 보존과 동일시하지 않는다. [Hot Reload 설정](https://www.jetbrains.com/help/rider/Settings_Hot_Reload.html)

아래 흐름·API·수치는 자체 설계안이다. 현재 도구의 모든 버전 조합에서 동작함을 확인한 결과는 아니다.

## 4. 리로드 정책

| 변경 종류 | 기본 처리 | 조건 |
|---|---|---|
| 메서드 본문·상수 로직 | IDE 지원 시 코드 패치 | 디버그 빌드·안전 지점·지원 수정 분류 |
| export 필드 추가·타입 변경 | 상태 캡처 후 scene 재생성 | schema migration이 제공될 때만 |
| inheritance·generic·native ABI 변경 | 전체 재빌드·플레이 재시작 | 자동 재개 가능한 체크포인트 제공 |
| `[Tool]` 편집기 코드 | 실패 격리 후 재로드 | 문서 저장·undo 상태 보호 |
| 복제 스키마·RPC 계약 변경 | 세션 전체 재시작 | 서버와 모든 클라이언트의 build/protocol 일치 |
| production 서버 코드 | 배포 버전 전환 | 개발용 핫리로드를 적용하지 않음 |

핫리로드 성공은 컴파일 성공, 코드 적용, 상태 복구, signal 중복 여부, 오류 없음의 다섯 단계를 통과한 상태다. 코드만 적용되고 상태를 잃은 경우에는 “재시작 완료”로 구분 표시한다.

## 5. 아키텍처·제안 계약

`ChangeClassifier`가 변경을 분류하고 `ReloadCoordinator`가 입력·게임 틱·오디오 이벤트를 안전 지점에서 일시 정지한다. `StateAdapter`는 등록된 게임 데이터만 직렬화한다. `ResourceResolver`는 UID로 리소스를 다시 찾고 `SignalRegistry`는 기존 연결을 해제한 뒤 재등록한다. `RollbackCheckpoint`는 복구 실패 시 이전 코드와 데이터로 돌아간다.

아래는 프로젝트용 신규 인터페이스이며 Godot 내장 API가 아니다.

```text
IReloadable.capture_state() -> {schema_version, stable_id, payload}
IReloadable.migrate_state(old_version, payload) -> migrated_payload
IReloadable.restore_state(payload, resource_resolver) -> RestoreResult
IReloadable.after_reload() -> ValidationResult

ReloadTransaction = {
  id, old_assembly_hash, new_assembly_hash,
  checkpoint_id, allowed_edit_class, affected_scene_ids, status
}
```

Node·native 포인터·delegate 자체를 영속 payload에 넣지 않는다. 타이머는 남은 시간, 랜덤 생성기는 seed와 진행 상태, 인벤토리는 stable item ID로 저장한다. 외부 요청·파일 쓰기처럼 재실행하면 부작용이 생기는 작업에는 transaction ID를 붙인다.

네트워크 테스트는 [28](28_Dedicated_Server_Runtime_Operations.md)의 Dedicated Server + 2 Clients 실행기를 재사용한다. 게임 코드를 바꾸는 동안 서버만 다른 스키마로 계속 실행되게 두지 않는다. 편집기의 상태 보존은 게임의 authoritative snapshot과 별도 계약이다.

## 6. 작업분해와 공수

| 작업 ID | 작업 | PW | 산출물 |
|---|---|---:|---|
| DX-01 | IDE·.NET·Godot 조합, 수정 유형 지원 범위 조사 | 2-3 | capability matrix·ADR |
| DX-02 | IDE 설정·디버거 연결·오류 위치 탐색 | 2-4 | 프로젝트 템플릿·진단 |
| DX-03 | 변경 분류·안전 지점·리로드 transaction | 3-5 | coordinator·오류 복구 |
| DX-04 | 상태·signal·timer·resource 복구 어댑터 | 3-5 | migration 예제·회귀 프로젝트 |
| DX-05 | `[Tool]` 안정화·멀티프로세스 디버깅 연결 | 2-4 | editor·DS/client 실행 프로파일 |
| DX-06 | 반복시간·누수·패키지·문서 검증 | 2-3 | 결과 보고·사용 가이드 |
| 합계 | 기존 IDE 능력 활용 기준 | **14-24** | 자체 컴파일러/IDE 제작 제외 |

## 7. 도입 단계

G0는 선택 IDE 하나에서 기존 기능을 재현하고 실패 유형을 수집한다. G1은 메서드 본문 수정과 읽기 전용 진단부터 연다. G2에서 명시적 state adapter를 구현한 샘플에만 상태 복구를 허용한다. G3에서 팀 프로젝트와 네트워크 실행기에 적용한다.

개발자가 지원되지 않는 수정을 하면 저장된 코드 변경은 유지하고 플레이를 안전하게 재시작한다. 무리하게 패치를 강제하지 않는다. 자동 적용 옵션은 초기에는 꺼 두고 검증된 수정 유형에 한해 프로젝트 설정으로 켤 수 있게 한다.

## 8. 완료 기준·실험

| 시험 | 조건 | 계획용 통과 기준 |
|---|---|---|
| 수정 분류 | 본문/필드/상속/generic/signal 변경 50개 | 지원·재시작 필요 여부를 명확하게 분류 |
| 반복 속도 | 대표 코드 20회 수정, cold build 제외 | 지원되는 수정의 저장→확인 p95를 기준선 대비 40% 단축 목표 |
| 상태 보존 | 이동·HP·인벤토리·timer·랜덤 상태 | 명세 필드 일치, side effect 중복 0건 |
| 장시간 안정성 | 같은 프로젝트에서 200회 리로드 | assembly/native handle 수의 지속 증가 없음 |
| 실패 복구 | 컴파일 오류·마이그레이션 실패·리로드 중 종료 | 원본 파일 보존, 이전 checkpoint 또는 명시적 재시작 |
| 네트워크 | DS+2 clients, 스키마 변경과 연결 중단 | 서로 다른 protocol 혼합 실행 거절 |

IDE/플러그인/엔진/.NET 버전, OS, debug 옵션, 변경 patch를 결과에 보관한다. p50/p95/p99와 수동 조작 단계를 함께 기록한다. 목표 수치는 아직 측정하지 않았다.

## 9. 위험과 중단 기준

리로드 성공률이 재현 코퍼스에서 95% 미만이면 자동 적용을 출시하지 않고 수동 IDE 기능만 제공한다. 상태 복원이 복잡한 게임은 전체 재시작 후 테스트 fixture 자동 로드로 반복 속도를 확보한다. `[Tool]` 코드가 저장·undo를 손상시키는 문제가 발견되면 해당 확장만 비활성화하는 안전 모드가 우선이다.

핫리로드가 release/AOT와 다른 동작을 숨길 수 있으므로 매 릴리스 후보는 깨끗한 빌드·완전 재시작으로 검증한다. 네트워크 동기화·세이브 호환성 완료 기준을 핫리로드가 대신하지 않는다.

## 10. 제출 산출물과 출처

산출물은 IDE 설정 템플릿, 리로드 지원 표, 상태 adapter 예제, 복구 transaction 로그, 성능 측정 스크립트, 실패 시 복구 안내다. 기존 .NET판과 새 GDExtension 바인딩 지원 표를 별도로 유지한다.

2026-11-24 열람: [Rider Godot support](https://www.jetbrains.com/help/rider/Godot.html), [Rider 2025.1 Godot 변경](https://www.jetbrains.com/rider/whatsnew/2025-1/), [Hot Reload 설정과 제한](https://www.jetbrains.com/help/rider/Settings_Hot_Reload.html), [Godot C# basics](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html).
