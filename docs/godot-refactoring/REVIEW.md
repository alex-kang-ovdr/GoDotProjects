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
| 22/23 스토어·패키지 | Forge-AssetStore, PlayHub-Store, `playforge_*` addon 7종 | 중복 스토어 금지. 정산·리뷰 gap만 |
| 25-28 네트워크 | Node 권위 서버 3종(`forge/Tools/*-multiplayer.cjs`), `package-windows-server.ps1`, `deploy/cloudrun`, PlayHub-GameDeploy | 기존 검토 ADR-12 결정 유지: Node 서버는 템플릿 전용, 제작자 게임용 Godot DS 경로를 25/28이 신규로 만든다 |
| 29 온라인 서비스 | Hub-SSO 4종 로그인, PlayHub-EOS, `hub-session-auth.cjs` | JoinTicket 계약만 신규, 계정은 Hub 소유 |
| 08 애니메이션 | Forge-UnrealPort 53본·ControlRig→SkeletonModifier3D, Forge-Avatar | 공통 retarget workflow로 수렴 |

### 3.2 멀티플레이 계획 문서가 세 벌이다

`forge/Docs/PlayForge_UGC_Design_v5_9`(PIE·EOS·안티치트), `PlayForge_Cloud_Consolidated_v17`(스트리밍·네트워크), 외부 컨설팅 계획 v1과 그 검토, 그리고 이번 25-30이 같은 범위를 다룬다. **25-30 착수 전에 어느 문서를 기준(SSOT)으로 삼을지 결정이 필요하다.** 권장: 계약·수명·복제는 이번 25-30, 배포·호스팅·신원 경계는 기존 컨설팅 계획 검토 결과를 따르고 충돌 시 이 문서에 기록한다.

### 3.3 보안 선행 조건이 MVP에 빠져 있다

기존 검토 §3.2대로 빌드·PIE가 Forge 호스트에서 격리 없이 실행된다(`build-queue.cjs`, `native-runtime.cjs`). 로드맵 MVP의 "30 필수 validator"는 게임 내 행동 검증만 포함한다. **격리 build worker를 16/30의 MVP 범위에 넣는다**(공수 재산정 필요, 추정 +2-4 PW — 본 검토의 추정치).

### 3.4 엔진 포크가 이미 있다

`godot-engine` 서브모듈(`alex-kang-ovdr/godot-engine`, pin `ed1daf0`)이 있으나 워크트리에서 초기화되지 않았다. 01/03/04/06/07/12/19/20의 `[GD-Core]` 작업은 서브모듈 체크아웃이 필요하며, 저장소 규칙상 대형 체크아웃은 사전 승인 대상이다. EngineLock의 `commit`은 이 서브모듈 pin을 기준으로 삼는다. 로드맵 §6의 "4.7.2 초기 후보"와 포크 pin이 같은 tag 기반인지 R0에서 확인한다(미확인).

### 3.5 03 텍스처 스트리밍 전제 확인 필요

PR #113429는 upstream master 병합이다. 우리 pin(4.7.2 기반 추정)에 포함되지 않았다면 backport가 필요하므로 공수가 바뀐다. 03 서브 브랜치의 첫 작업으로 둔다.

### 3.6 일정 가정

§9.2의 12-18주는 전담 엔지니어 3-4명 기준이다. 이 저장소는 에이전트 중심 병행 작업이므로 PW→기간 환산을 그대로 쓰지 않는다. R0 스파이크 결과로 재산정한다는 로드맵 원칙만 따른다.

## 4. 브랜치 운영 결정

- 상위: `Godot-Refactoring` (기준 트렁크 `PlayHub-Platform`). 로드맵 SSOT·검토·착수 문서와 엔진 패치 큐를 관리한다. 통합은 사용자 요청 시에만 머지한다.
- 엔진 변경 항목(01/03/04/05/06/07/12/19/20/21)은 `Godot-Refactoring-<번호>-<주제>` 10개 브랜치, 엔진 무변경 항목은 영역별 Forge 계열 브랜치로 통합한다. 대상은 [README.md](README.md)·[branches.json](branches.json).
- 워크트리: 30개 동시 체크아웃(브랜치당 약 9,900 파일)은 대형 체크아웃에 해당하므로 **착수하는 브랜치만** `D:\Github\GoDotProjects-worktrees\` 아래에 만든다.
- 소유권: 트렁크 AGENTS.md §2(새 브랜치는 같은 작업에서 등록)에 따라 `Godot-Refactoring`·`Forge-Profiling`·`Forge-BuildExport`·`Forge-Multiplayer`를 `owners.json`에 등록했다. 네 브랜치에 같은 등록 내용을 넣어 병합 시 충돌이 나지 않게 했다.

## 5. 결정 필요 사항

1. 25-30 네트워크 계획의 기준 문서(§3.2)
2. 격리 build worker를 MVP에 포함할지(§3.3)
3. 원본 개별 계획서 30개 패키지 반입
4. R0 착수 브랜치(권장: 16 → 13 → 25 → 28)의 워크트리 생성 승인

## 6. 이번 검토에서 수행한 것과 하지 않은 것

- 수행: 로드맵·90번 기록 정독, PDF hash 대조, 공수 합계 재계산, 저장소 파일·브랜치·소유권 대조.
- 하지 않음: PDF 본문 전체 재검토(텍스트 추출 시 한글 글꼴 인코딩이 깨져 7-10쪽 표 구조만 확인), 엔진 서브모듈 체크아웃·빌드, 외부 출처 재확인, 개별 계획서 30개 검토(파일 없음).
