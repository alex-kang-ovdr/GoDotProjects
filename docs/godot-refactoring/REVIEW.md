# 계획 검토: Godot 엔진 개선 통합 개발 로드맵

- 대상: [00_Development_Roadmap.md](00_Development_Roadmap.md), [90_Source_Coverage_and_Validation.md](90_Source_Coverage_and_Validation.md) (기준일 2026-11-24)
- 원본 근거: 「유니티 대비 고도 엔진 개선방안.pdf」 SHA-256 `043d3c4d…6ce4784` — 90번 기록의 hash와 일치함을 확인
- 검토: 2026-11-25, 최초 `PlayForge-Main` `26467dfc` 기준으로 대조한 뒤 트렁크 `PlayHub-Platform` `668e4b9d` 기준 `Godot-Refactoring` 브랜치로 옮김
- 관련 기존 검토: [docs/architecture/multiplayer-plan-review.md](../architecture/multiplayer-plan-review.md) (외부 멀티플레이 계획 v1 검토)

## 1. 총평

- **채택 가능한 계획이다.** "기존 기능 → addon/GDExtension → 최소 코어 patch" 순서, MVP와 R&D 분리, 외부 승인 항목을 우리 완료일로 약속하지 않는 원칙은 이 저장소의 운영 방식과 맞는다.
- **이 저장소를 보지 않고 쓴 범용 엔진 계획이다.** 30개 항목 중 약 절반은 이미 이 저장소의 다른 브랜치가 일부 구현했거나 소유한 영역과 겹친다(§3). 그대로 착수하면 중복 구현과 소유권 충돌이 생긴다.
- **개별 계획서 30개가 아직 없다.** 로드맵이 링크하는 `plans/01…30_*.md`는 이번에 받은 자료에 포함되지 않았다. 각 서브 브랜치는 로드맵 색인과 이 검토로 만든 착수 문서([items/](items/))로 시작하며, 원본 계획서를 받으면 같은 폴더에 반입한다.
- **수치 정합성은 맞다.** 범주별 공수 합계(226-363 / 168-284 / 185-311 / 114-176 → 693-1,134 PW)와 MVP 합계(36-52 PW)를 색인 표에서 다시 더해 일치를 확인했다.

## 2. 그대로 채택할 부분

| 로드맵 | 판단 |
| --- | --- |
| §1 개발 순서(기존 기능 → 확장 → 최소 patch) | 채택. `[GD-Ext]`와 `[GD-Core]` 커밋 영역 구분과 같은 원칙 |
| §7 공통 계약(EngineLock·BuildManifest·WorldKey·JoinTicket 등) | 채택. 착수 전 ADR로 동결 — 담당은 R0의 16/25/28 브랜치 |
| §7 식별자 분리(RID/UID/NetObjectId/user_id) | 채택 |
| §8 28↔29 계약 선동결 후 병행 | 채택 |
| §9.1 기술 스파이크 6-10 PW, §10 R0-R3 Go/No-Go | 채택. 서브 브랜치 착수 순서를 R 단계로 정렬함([README](README.md)) |
| §12 검증 계약(raw samples, 재현 seed, 지원 조합만 표시) | 채택. 저장소 규칙(실행한 검증과 미검증 구분)과 같음 |

## 3. 저장소 현황과 어긋나거나 빠진 부분

### 3.1 이미 있는 구현과 겹친다

| 항목 | 이미 있는 것 | 처리 |
| --- | --- | --- |
| 13 진단 | `ISMProfile`(Forge-ISM-profile), 데일리 프로파일·GPU 텔레메트리 | TraceSample 스키마로 기존 출력을 묶는다. 새 profiler부터 만들지 않는다 |
| 15 협업 | `collaboration.cjs`·`yjs-entry.js`, Drive snapshot/sync, Forge-Publish | gap 분석 후 snapshot/복원 부족분만 |
| 16 빌드 | `build-queue.cjs`, `export-godot-project.cjs`, `tools/build-version`, PlayHub-DevOps | EngineLock을 기존 build-version·release-manifest에 통합 |
| 17 모바일 QA | Forge-GamerQA, PlayHub-GamerQA, Hub-AOS/IOS | 실기기 절차만 신규 |
| 18 결제·광고 | Hub-Billing, Hub-AdGame | billing 원장은 Hub-Billing 소유 유지 |
| 22/23 스토어·패키지 | Forge-AssetStore, PlayHub-Store, `playforge_*` addon 9종(트렁크 기준) | 중복 스토어 금지. 정산·리뷰 gap만 |
| 25-28 네트워크 | Node 권위 서버 3종(`forge/Tools/*-multiplayer.cjs`), `package-windows-server.ps1`, `deploy/cloudrun`, PlayHub-GameDeploy | 기존 검토 ADR-12 결정 유지: Node 서버는 템플릿 전용, 제작자 게임용 Godot DS 경로를 25/28이 신규로 만든다 |
| 29 온라인 서비스 | Hub-SSO 4종 로그인, PlayHub-EOS, `hub-session-auth.cjs` | JoinTicket 계약만 신규, 계정은 Hub 소유 |
| 08 애니메이션 | Forge-UnrealPort 53본·ControlRig→SkeletonModifier3D, Forge-Avatar | 공통 retarget workflow로 수렴 |

### 3.2 멀티플레이 계획 문서가 여러 벌이다 (→ [SSOT.md](SSOT.md))

처음 검토에서는 세 벌로 봤으나 재조사 결과 최소 8개 출처가 겹친다: UGC Design v5.9, Cloud Consolidated v17, Godot Review v1(07·15, ADR-G07/G08), 컨설팅 계획 검토(ADR-12), multiplayer-deploy-billing-plan, game-server-cost-optimization-plan, EOS SSOT 계획, 이번 25-30. 영역별 정본은 [SSOT.md](SSOT.md) §2에서 판정했다. 요지: Godot 게임 내부 계층은 25-30, 배포·호스팅·과금은 deploy-billing·비용 계획, 신원·매치메이킹은 EOS 계획, 게임 서버 입장 티켓은 JoinTicket 하나로 통일한다.

### 3.3 격리 빌드는 있으나 기본값이 아니다

처음 검토의 "격리 없음"은 정정한다. `PLAYFORGE_BUILD_BACKEND=cloudrun-job`이면 Cloud Run Jobs 격리 worker(`docs/architecture/build-worker-p0-plan.md`, `deploy/cloudrun/build-worker/`)로 빌드한다. 남은 gap은 (1) 기본값이 Forge 호스트 로컬 실행, (2) worker가 포크가 아닌 순정 4.7.2를 내려받음, (3) PIE(`native-runtime.cjs`)는 여전히 로컬 실행이다. 이 gap은 16(Forge-BuildExport)에서 다룬다. 공개 전 기본값 전환을 권장한다.

### 3.4 엔진 포크가 이미 있다

트렁크에는 이미 엔진 정본이 있다: [tools/engine/engine-ssot.json](../../tools/engine/engine-ssot.json)(포크 `alex-kang-ovdr/godot-engine`, upstream base `4.7.2-stable` `ed1daf0`, 포크 pin `e7a83dd7`, release tag `playforge-4.7.2-e7a83dd7`, 6개 타깃별 SCons 프로필)과 검사기 `npm run check:engine-ssot`. 6개 타깃 중 `web-editor`만 포크로 전환됐고 나머지 5개(desktop-windows, web-template, cloudrun-worker, android-aar, ios-xcframework)는 `pending_fork_rebuild`다(파일 기준, 2026-11-25).

- **로드맵 §7 EngineLock은 새로 만들지 않는다.** engine-ssot.json이 정본이고, 16(Forge-BuildExport)의 BuildManifest는 거기서 파생한다.
- 엔진 변경 항목(Godot-Refactoring-*)의 패치는 포크 저장소에 커밋하고, 서브모듈 pin과 engine-ssot.json의 `pinnedForkCommit`을 함께 올린다(검사기가 불일치를 FAIL 처리).
- 서브모듈은 워크트리에서 초기화되지 않았다. 엔진 변경 브랜치 착수 시 체크아웃 승인이 필요하다.
- 남은 5개 타깃의 포크 재빌드가 엔진 변경 항목보다 먼저다. 그 전에는 패치를 넣어도 데스크톱·서버·모바일 산출물에 반영되지 않는다.

### 3.5 03 텍스처 스트리밍 전제 확인 필요

PR #113429는 upstream master 병합이다. 우리 pin(4.7.2 기반 추정)에 포함되지 않았다면 backport가 필요하므로 공수가 바뀐다. 03 서브 브랜치의 첫 작업으로 둔다.

### 3.6 일정 가정

§9.2의 12-18주는 전담 엔지니어 3-4명 기준이다. 이 저장소는 에이전트 중심 병행 작업이므로 PW→기간 환산을 그대로 쓰지 않는다. R0 스파이크 결과로 재산정한다는 로드맵 원칙만 따른다.

## 4. 브랜치 운영 결정

- 상위: `Godot-Refactoring` (기준 트렁크 `PlayHub-Platform`). 로드맵 SSOT·검토·착수 문서와 엔진 패치 큐를 관리한다. 통합은 사용자 요청 시에만 머지한다.
- 엔진 변경 항목(01/03/04/05/06/07/12/19/20/21)과 기존 포크 패치(아바타·Jolt)는 godot-engine 포크 저장소의 `Godot-Refactoring-*` 브랜치에서 작업한다([SSOT.md](SSOT.md) §3). 엔진 무변경 항목은 영역별 Forge 계열 브랜치로 통합한다. 대상은 [README.md](README.md)·[branches.json](branches.json).
- 워크트리: 30개 동시 체크아웃(브랜치당 약 9,900 파일)은 대형 체크아웃에 해당하므로 **착수하는 브랜치만** `D:\Github\GoDotProjects-worktrees\` 아래에 만든다.
- 소유권: 트렁크 AGENTS.md §2(새 브랜치는 같은 작업에서 등록)에 따라 `Godot-Refactoring`·`Forge-Profiling`·`Forge-BuildExport`·`Forge-Multiplayer`를 `owners.json`에 등록했다. 네 브랜치에 같은 등록 내용을 넣어 병합 시 충돌이 나지 않게 했다.

## 5. 결정 필요 사항

1. 25-30 네트워크 계획의 기준 문서(§3.2) — [SSOT.md](SSOT.md)에서 판정. 남은 결정은 SSOT.md §5
2. 격리 build worker를 기본값으로 전환할지(§3.3)
3. 원본 개별 계획서 30개 패키지 반입
4. (완료) R0 착수 — 2026-11-25 Forge-Profiling(13), Forge-BuildExport(16), Forge-Multiplayer(25+28) 워크트리 생성

## 6. 이번 검토에서 수행한 것과 하지 않은 것

- 수행: 로드맵·90번 기록 정독, PDF hash 대조, 공수 합계 재계산, 저장소 파일·브랜치·소유권 대조.
- 하지 않음: PDF 본문 전체 재검토(텍스트 추출 시 한글 글꼴 인코딩이 깨져 7-10쪽 표 구조만 확인), 엔진 서브모듈 체크아웃·빌드, 외부 출처 재확인, 개별 계획서 30개 검토(파일 없음).
