# 중복 계획·구현 정본(SSOT) 판정

- 작성: 2026-11-25, 트렁크 `PlayHub-Platform` `668e4b9d` 기준
- 근거: 저장소 문서·코드·브랜치 대조 조사(읽기 전용). 확인하지 못한 항목은 "미확인"으로 표시했다.
- 이 문서는 Godot 엔진 개선 로드맵 30개 항목과 기존 계획이 겹치는 부분에서 **어느 문서·코드를 정본으로 삼는지**를 정한다. 원 문서는 각 소유 브랜치가 갱신한다. 이 브랜치는 다른 브랜치 소유 파일을 고치지 않고 §4의 갱신 요청으로 남긴다.

## 1. 판정 원칙

1. 이미 구현되어 트렁크에 있는 코드·계약이 문서보다 우선한다.
2. 트렁크에 있는 Godot 기준 문서가 Godot 이전(C++/Lua 자체 엔진 전제) 설계 문서보다 우선한다. `PlayForge_UGC_Design_v5_9`, `PlayForge_Cloud_Consolidated_v17`은 **참고 자료**로만 둔다.
3. 같은 수준이면 최신 문서가 우선한다. 단, 스스로 SSOT라고 명시한 문서(빌드 버전 정책, EOS 계획, engine-ssot.json)는 그 범위 안에서 유지한다.
4. 로드맵 25-30은 **Godot 게임 내부 계층**(역할·RPC·복제·예측·게임 내 검증)의 정본이다. 배포·호스팅·과금·신원·매치메이킹은 기존 트렁크 문서를 따른다.

## 2. 영역별 정본

| 영역 | 정본 | 참고만 / 대체됨 | 로드맵 항목의 위치 |
| --- | --- | --- | --- |
| 엔진 버전·포크 pin·타깃 프로필 | [tools/engine/engine-ssot.json](../../tools/engine/engine-ssot.json) + `npm run check:engine-ssot` | `GODOT_ENGINE_SSOT_PIPELINE.md`(pin `fe0b4fe` 기재), `docs/migration/godot-submodule.md`·`HUB_DESKTOP_PLAN.md`(`ed1daf0` 기재) — 모두 낡음 | 로드맵 §7 EngineLock = engine-ssot.json. 새로 만들지 않음 |
| 빌드 식별자(buildId) | [docs/architecture/build-version-naming-policy.md](../architecture/build-version-naming-policy.md) + `tools/build-version/resolve-build-info.mjs` | — | 16 BuildManifest는 이 buildId를 그대로 쓰고 engine-ssot의 포크 커밋·템플릿 hash를 **연결**만 한다 |
| UGC 릴리스 기록 | `forge/Tools/release-manifest.cjs` (`serverBundle`은 아직 null) | — | 16 BuildManifest의 artifacts·content_hash를 release-manifest에 넣는 방향(소유 브랜치 합의 필요) |
| 데스크톱 배포 매니페스트 | `contracts/desktop/release-manifest.v1`, `content-manifest.v1` | — | 배포 형식이라 별도 유지. engineVersion을 engine-ssot에서 받도록 요청(§4) |
| 격리 빌드 | `docs/architecture/build-worker-p0-plan.md` + `deploy/cloudrun/build-worker/` (`PLAYFORGE_BUILD_BACKEND=cloudrun-job`) | REVIEW §3.3의 "격리 없음" 서술은 정정 | 16이 남은 gap(기본값이 로컬 실행, worker가 순정 4.7.2를 받음)만 맡는다 |
| 멀티플레이 배포·호스팅·과금 | [multiplayer-deploy-billing-plan.md](../architecture/multiplayer-deploy-billing-plan.md) (`serverRuntime: none / node-wss-v1 / godot-linux-wss-v1`), [game-server-cost-optimization-plan.md](../architecture/game-server-cost-optimization-plan.md), [creator-server-optimization-guide.md](../architecture/creator-server-optimization-guide.md) | 컨설팅 계획 v1 원문 | 28은 `godot-linux-wss-v1` 런타임의 Godot 쪽 구현 |
| 템플릿 vs 제작자 서버 | [multiplayer-plan-review.md](../architecture/multiplayer-plan-review.md) ADR-12: Node 서버 4종은 템플릿 전용, 제작자 게임은 Godot DS | UGC v5.9 서버 설계 | 25/28은 Node 서버를 바꾸지 않음 |
| 방·프로세스 단위, 네트워크 스키마 위치 | Godot Review v1 ADR-G07(방 1개 = 프로세스 1개), ADR-G08(네트워크 스키마·Ready Barrier는 엔진 밖) | Cloud v17 Streaming_Network | 25-27은 addon/GDExtension으로만 구현. 26 Iris식 복제도 **엔진 패치 없음** |
| 신원·데이터·매치메이킹 경계 | [EOS_FEASIBILITY_AND_SSOT_PLAN.md](../eos/EOS_FEASIBILITY_AND_SSOT_PLAN.md): 리더보드·제재·통계·DataStore는 PlayHub DB, 매치메이킹은 PlayHub Gateway + JoinTicket | UGC v5.9 매치메이커 설계 | 29는 JoinTicket 계약과 Godot 측 검증만. 계정·로그인은 Hub-SSO |
| 게임 서버 입장 티켓 | **JoinTicket 하나**: deploy-billing 계획의 필드를 정본으로 하고, 비용 계획의 `ConnectTicket`은 같은 개념의 다른 이름으로 본다 | — | 25/28 스파이크의 로컬 fake provider가 첫 구현. Hub Gateway 구현 때 같은 필드로 옮긴다 |
| 클라이언트 실행 티켓 | 웹 LaunchGrant(컨설팅), 데스크톱 L9 Launch Ticket(`contracts/desktop/launch-ticket.v1`) | — | JoinTicket과 **다른 계층**(클라이언트 실행 vs 게임 서버 입장). 합치지 않음 |
| 안티치트 | EOS 계획: EAC **보류** | UGC v5.9 "PC에서 EAC 선택" | 30은 서버 행동 검증·입력 제한·UGC 격리가 범위. EAC는 R3 이후 선택 |
| 크로스플레이 릴레이 | `hub/server/ugc-multiplayer.mjs` + `tools/ugc-shared/mmo-room-core.cjs` (Forge-Publish) | — | 29의 relay는 이 경로를 재사용 검토 |
| 진단 trace 형식 | 로드맵 13 TraceSample(Forge-Profiling, `docs/profiling/`) | ISMProfile CSV, HavokProfile CSV, daily-profile JSON, 데스크톱 `shader_telemetry`는 각 도구의 원시 출력으로 유지하고 TraceSample로 변환 | 13 |
| 물리 결정성 | Forge-HavokPhysics 벤치마크: **같은 기기 반복 실행**에서만 상태 hash 일치 확인 | — | 12/27은 기기 간 결정성을 가정하지 않는다(서버 보정 전제) |
| 게임 스크립트 언어 | GDScript (로드맵 §1, 실제 템플릿 전부) | Godot Review v1 ADR-G04·UGC v5.9의 Lua 5.4 — **사용자 확인 필요**(§5) | 10/11/20 C#은 R3 선택 |

## 3. 엔진 패치 정책과 현재 패치 큐

Godot Review v1 `02_Minimal_Change_Policy.md`는 코어 수정(E3)을 기본 금지하고 예외는 ADR로 받게 한다. 하지만 실제 포크에는 ADR 없이 코어 패치 7개가 들어가 있다(예외 ADR은 검색으로 찾지 못함, 미확인).

**판정**: 로드맵 §13의 패치 규칙(패치마다 이유·대체 불가 API·회귀 fixture·upstream 상태·제거 조건)을 E3 예외 ADR의 양식으로 쓴다. 기존 패치도 같은 양식으로 사후 기록한다. 엔진 변경 항목(Godot-Refactoring-*)은 이 양식을 채우기 전에 포크에 커밋하지 않는다.

포크 `alex-kang-ovdr/godot-engine`, upstream `4.7.2-stable` `ed1daf0` 위 7개 커밋(포크 워크트리 `Forge-GodotEngine`에서 확인):

| 커밋 | 날짜 | 내용 | 성격 | 사후 기록 담당 |
| --- | --- | --- | --- | --- |
| `a18fb005` | 11-21 | 엔진 레벨 아바타·CoreHUD 불변 봉인, 빈 3D 자동 부트스트랩 | 제품 기능의 코어 반입 | Forge-Avatar |
| `fe0b4fe1` | 11-21 | 게임 모드별 3D 렌더타겟 초상 UI, C++ 최소 UI 사이즈 봉인 | 제품 기능의 코어 반입 | Forge-Avatar |
| `ed003ce5` | 11-22 | CoreHUD 30초 임시 숨김·충전, 템플릿 위치 설정 | 제품 기능의 코어 반입 | Forge-Avatar |
| `83f5f345` | 11-23 | Jolt 락프리 JobSystem, 병렬 pre_step, PlayForgePhysicsBatch | 성능 패치 | Godot-Refactoring-12 |
| `70892ae8` | 11-23 | x86_64 데스크톱 Jolt AVX2/FMA/SSE4.2 | 빌드 설정(데스크톱 한정 → 기기 간 결정성 영향) | Godot-Refactoring-12 |
| `c9050da1` | 11-23 | JoltContactListener3D 락프리·fast path | 성능 패치 | Godot-Refactoring-12 |
| `e7a83dd7` | 11-23 | Jolt GSK 워밍업 캐시, A/B 계측 API | 성능 패치 + 계측 API | Godot-Refactoring-12 |

- 아바타·CoreHUD 3건은 "공개 API로 불가능한 경우에만 최소 패치" 원칙에 맞는지 재검토 대상이다(제거하면 Forge-Avatar 기능이 깨지므로 즉시 되돌리지 않는다).
- Jolt 4건은 실험 브랜치(Forge-HavokPhysics, 트렁크 미통합 분류)에서 나온 결과가 트렁크 pin에 들어간 것이다. 회귀 fixture와 upstream 상태를 12에서 기록한다.

### 엔진 변경 브랜치의 작업 위치

엔진 소스 커밋은 포크 저장소에서 같은 이름의 브랜치(`Godot-Refactoring-NN-*`)로 만든다. 이 저장소의 같은 이름 브랜치에는 서브모듈 pin 갱신, `engine-ssot.json`의 `pinnedForkCommit`, 문서·테스트만 넣는다. 남은 5개 타깃(desktop-windows, web-template, cloudrun-worker, android-aar, ios-xcframework)이 `pending_fork_rebuild`인 동안은 엔진 패치가 해당 산출물에 반영되지 않는다.

## 4. 다른 브랜치에 보낼 갱신 요청

이 브랜치는 아래 파일을 고치지 않았다. 소유 브랜치가 반영한다.

| 파일 | 소유 | 요청 |
| --- | --- | --- |
| `docs/architecture/GODOT_ENGINE_SSOT_PIPELINE.md` | PlayHub-Platform | pin `fe0b4fe` → `e7a83dd7`, 또는 pin 값은 engine-ssot.json 참조로 바꿔 중복 제거 |
| `docs/migration/godot-submodule.md` | 미확인 | "코어 패치 없음, pin ed1daf0" 서술 정정 |
| `docs/desktop/HUB_DESKTOP_PLAN.md` | Hub-Desktop | 엔진 pin 서술을 engine-ssot.json 참조로 |
| `docs/architecture/multiplayer-plan-review.md` | PlayHub-Platform | Node 서버 3종 → 4종(captain-forever-mmo 추가), 격리 worker 존재 반영 |
| `docs/architecture/game-server-cost-optimization-plan.md` | PlayHub-Platform | `ConnectTicket`을 `JoinTicket`으로 용어 통일 |
| `forge/Tools/release-manifest.cjs` | 미확인 | engine 필드에 포크 커밋·release tag 추가(16 결과 반영 후) |
| `forge/Docs/PlayForge_UGC_Design_v5_9/`, `PlayForge_Cloud_Consolidated_v17/` | — | 머리말에 "Godot 이전 설계, 참고 자료"라고 표시 |

## 5. 사용자 결정이 필요한 것

1. **게임 스크립트 언어**: GDScript를 기본으로 확정하고 Lua 5.4(Review v1 ADR-G04)를 철회할지.
2. **아바타·CoreHUD 코어 패치 3건**: 엔진 패치로 유지할지, addon/모듈로 옮기는 작업을 Forge-Avatar에 맡길지.
3. **§4 갱신 요청**을 각 소유 브랜치에 보낼지(직접 수정은 소유권 위반).
