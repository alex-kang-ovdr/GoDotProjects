# 11 · INI·Console·Device Profile·진단·지역화

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 표면 API 유지, 구현은 얇게 매핑

PlayForge의 Unreal식 INI/CVar/Console은 사용자 경험으로 유지할 수 있다. 다만 Godot ConfigFile은 INI형 저장 도우미이고 ProjectSettings는 설정 저장소이므로, Unreal식 배열 병합·Source priority·Cheat flag·runtime 적용 규칙은 PlayForge가 정의한다. [G34](../references/Verified_Sources.md#g34)[G35](../references/Verified_Sources.md#g35)

하나의 registry에 이름, 타입, 기본값, 허용 범위, 권한, target, apply mode, backend mapping을 둔다. 지원하지 않는 `r.*` 이름을 등록만 해 놓고 효과가 있는 것처럼 표시하지 않는다.

## 설정 분리

| 설정 | 성격 | 처리 |
|---|---|---|
| Renderer/API 선택 | 시작 시 | startup profile·재시작 |
| Physics backend | 시작 시 | target contract·재시작 |
| Device Profile 기본값 | 초기 설정 | capability와 병합 |
| 해상도·안전한 품질 값 | 런타임 | 공개 setter·안전 시점 |
| Cell size | 소스/Cook | 재생성 필요 |
| streaming 거리 | 런타임 정책 | 불변식 검증 후 적용 |
| CVar debug overlay | 실행 View | 개발 권한 |

물리 서버는 runtime 교체가 허용되지 않는다. `ConfigFile`에 새 값을 쓰는 것만으로 이미 초기화된 서브시스템이 변경되지 않는다. [G18](../references/Verified_Sources.md#g18)[G34](../references/Verified_Sources.md#g34)

## Scalability

Mobile/Desktop은 물리적으로 다른 게임 스키마가 아니라 성능·표현 프로필이다. Godot renderer/feature 태그와 연결하되 품질 값으로 사용할 수 없는 기능을 강제로 활성화하지 않는다. [G36](../references/Verified_Sources.md#g36)

적용 결과는 requested/effective/source/restart_required를 구분해 Inspector와 콘솔에 표시한다. Device Profile은 기본값과 하드웨어 제한을 분리한다. 권한이 높은 Console도 지원하지 않는 기능이나 안전 한도를 우회하지 못한다.

## Console과 프로파일러

명령은 로컬 View, Runtime, Authority Server, Workspace를 명시적으로 선택한다. 게임 Lua에 문자열 `ExecuteConsole`을 무제한 노출하지 않는다. 외부 AI도 동일한 명령 권한을 따른다.

기본 지표는 Scene 생성 시간, Lua 실행, 물리 Step, Replication, Render frame, 메모리, 패키지 I/O다. 엔진 내부 단계가 공개되지 않으면 어댑터 구간만 측정하고 'Havok Solver 내부 시간'처럼 이름을 붙이지 않는다. `headless`와 GPU 측정 환경은 별도다.

Log는 category/verbosity, world/session/request ID, source location, redaction 정책을 유지한다. 멀티 Room 로그를 user-visible game log와 플랫폼 보안 로그로 분리한다. optional 상세 profiling은 실행 비용을 함께 기록한다.

## FName / GameplayTag

StringName은 interned string이므로 FName의 구현 후보지만 process-local 식별값을 저장 포맷이나 네트워크 dictionary로 내보내지 않는다. [G33](../references/Verified_Sources.md#g33)

GameplayTag는 문자열 이름만 있는 Resource가 아니라 검증된 계층 ID·부모 관계·정확/상위 매칭 규약을 가진 PF 데이터로 유지한다. Content SEO tag와 공유하지 않는다. runtime dictionary hash를 handshake에 포함하고 동일 ID의 의미 변경을 금지한다.

## FLocText / AI 번역

namespace/key/source/typed arguments를 프로젝트 원본에 보관한다. Godot 표시 문자열로 변환한 값을 영구 원문으로 덮어쓰지 않는다. 표시 언어 변경은 UI 갱신 이벤트로 연결하고 게임 상태·RPC ID는 언어와 분리한다.

ICU plural/select·날짜·숫자 문법을 채택했다면 그 의미를 유지하는 formatter를 함께 검증한다. Godot 기본 번역 기능이 같은 메시지 문법을 자동 이해한다고 가정하지 않는다. 사람 검토 번역 보호, 원문 변경 stale 표시, locale별 재Cook 원칙은 그대로다.

## 에디터 UI

Project Settings, Runtime Console, Device Profile, Material Quality를 별도 새 시스템으로 만들지 않고 공통 Schema·Property View를 사용한다. 특정 게임의 중력·난이도·점수는 프로젝트가 제공하는 값이며 플랫폼 UI에 이름을 넣지 않는다.

**완료 기준:** 실제 engine mapping 없는 설정은 미지원/계획 상태로 보이고, 적용됐다는 거짓 성공 응답을 반환하지 않는다.
