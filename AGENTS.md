# PlayHub-Platform 에이전트 작업 규칙 (SSOT)

이 문서는 `PlayHub-Platform` 저장소에서 작업하는 **모든 AI 에이전트(Claude Code, Antigravity/Gemini, Codex 등)와 사람**이 따르는 단일 정본(Single Source of Truth) 규칙이다. `CLAUDE.md`·`GEMINI.md`는 이 파일을 참조만 하며 별도 규칙을 두지 않는다. 사용자의 명시적 요청을 최우선으로 따르며, 위임으로 작업 범위나 권한을 확대하지 않는다.

> 규칙을 바꿀 때는 이 파일만 수정한다. 하위 디렉터리 규칙(`games/AGENTS.md` 등)은 해당 디렉터리에만 추가로 적용된다.

---

## 0. 빠른 시작 (에이전트 필독)

| 항목 | 값 |
|---|---|
| 통합 트렁크 | `PlayHub-Platform` (사용자가 "메인"이라고 지칭하는 통합 대상도 `PlayHub-Platform`이며, `main` 브랜치는 별도 요청 없이 건드리지 않음) |
| 런타임 | Node.js **24 이상** (`.nvmrc`). 시스템 Node가 24 미만이면 `artifacts/local-runtime/node24/node.exe` 사용 |
| 머지 전 필수 게이트 | `npm run gate` (= 소유권 + 스킬 동기화 + Fast QA) |
| 소유권 확인 | `npm run check:ownership` |
| 스킬 정본 | `.agents/skills/` (`.claude/skills/`는 동기화 사본, `npm run sync:skills`) |
| QA 테스트 카탈로그 (SSOT) | `tools/qa/test-catalog.json` (신규 테스트 추가·분류·격리는 이 파일에 등록, 실행은 `npm run qa:*` / `node tools/qa/run-suite.mjs`) |

주요 디렉터리:

| 경로 | 역할 |
|---|---|
| `hub/` | PlayHub 사용자·관리자 서버/웹 (`hub/tests/`) |
| `forge/` | PlayForge 서버·웹 에디터·Godot 애드온·템플릿 (`forge/Tests/`) |
| `store/` | PlayForge Asset Store |
| `games/` | 웹 게임 실행본·카탈로그 (`games/AGENTS.md`) |
| `android/`, `ios/` | 모바일 Play Hub 앱 |
| `deploy/`, `.github/workflows/` | Cloud Run 배포 및 CI |
| `tools/` | 변환기·QA(`tools/Gamer/GamerQA`)·소유권·빌드 버전 도구 |
| `docs/` | 설계·계획·검증 리포트 |
| `references/`, `artifacts/` | 원본 레퍼런스·로컬 산출물 (코드 수정 대상 아님) |

---

## 1. 커밋 메시지 규칙 (`write-commit`)

커밋 메시지 작성 또는 실제 커밋 시 [.agents/skills/write-commit/SKILL.md](.agents/skills/write-commit/SKILL.md)를 따른다.

- **제목 형식**: `[영역태그] [변경유형:] 한국어 변경 요약`
  - 영역 태그: `[Admin]` `[Hub]` `[Forge]` `[GD-Ext]` `[GD-Core]` `[Game]` `[Script]` `[Tool]` `[QA]` (여러 영역이면 연달아 붙인다)
  - `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `merge:`는 영역 태그 뒤에 선택적으로 붙인다.
- **본문 (한국어)**: `변경 이유` / `요청 내용` / `변경 내용`(실행한 검증과 생략한 검증 구분) / `사용 모델 및 작업 시간`
- **기계 판독 메트릭**: 에이전트 커밋은 본문 아래 빈 줄 뒤에 `Agent-*` Git trailer(사용자 요청 수·소요시간·권한/판단 요청 수·모델별 토큰)를 붙인다. 커밋 메시지 작성 직전 샌드박스(`BypassSandbox: false`)에서 `powershell -NoProfile -ExecutionPolicy Bypass -File tools/agent-skills/collect-agent-metrics.ps1 -SinceLastCommit`을 실행해 대화 로그(`transcript.jsonl`)의 실측값을 채우며(`N/A` 금지), 트랜스크립트가 없는 환경에서만 `N/A`로 적는다.
- **실행 방식**: 제목과 본문 전체를 UTF-8 임시 파일로 작성해 `git commit -F <파일>`로 전달하고 커밋 결과를 확인한다.
- **권한 승인 재발 방지 (Prefix-Match 명령 형태)**:
  - `.git/*` 내부 파일은 파일 도구(`read_file`/`edit_file`)로 직접 읽거나 수정하지 않고 `git config` 명령으로만 조회·변경한다.
  - `BypassSandbox: true`가 필요한 명령(`git add`/`commit`/`push`, 외부 네트워크 호출)에는 `$변수` 대입, `$(...)` 치환, 멀티라인 `;`/`\n`/`if ($LASTEXITCODE)` 체인을 절대 사용하지 않고 단일 리터럴 명령으로 실행해 `Always Allow` 접두어 매칭이 유지되게 한다.
  - GitHub Actions CI 상태 조회 및 라이브 Cloud Run 스모크 검증은 인라인 스크립트 대신 `powershell -NoProfile -ExecutionPolicy Bypass -File tools/devops/check-ci-status.ps1` 및 `powershell -NoProfile -ExecutionPolicy Bypass -File tools/devops/verify-cloudrun-live.ps1`을 사용한다.

---

## 2. 워크트리 소유권·브랜치·머지 규칙

- **소유권**: `tools/worktree-ownership/owners.json`의 브랜치별 소유 경로(`owns`)와 공유 핫스팟(`shared`)을 준수한다. 커밋 전 `npm run check:ownership`으로 타 브랜치 소유 경로 침범(FAIL)이 없는지 확인한다.
- **새 기능 브랜치**: 워크트리를 만들면 같은 작업에서 `owners.json`에 브랜치와 `owns` 경로를 등록한다. 미등록 브랜치는 모든 변경이 WARN으로 표시된다.
- **공유 핫스팟**(`hub/server/app.mjs`, `hub/tools/restore-data.mjs`, `hub/tools/sanitize-snapshot.mjs`, `hub/web/user/app.js` 등): 수정 전 트렁크 최신 커밋으로 리베이스하고, 기존 등록 항목을 지우지 않고 **추가만** 한다. DB 테이블을 추가하면 `restore-data.mjs`(`OPTIONAL_TABLES`)와 `sanitize-snapshot.mjs`(`SCHEMA_ALLOWLIST`, 민감 테이블은 `DROP_TABLES`)를 반드시 함께 갱신한다.
- **머지 전 의무**: 기능 브랜치는 트렁크 최신 커밋을 반영(리베이스 또는 역머지)한 상태에서 `npm run gate`를 통과해야 트렁크에 병합할 수 있다.
- **브랜치 이름**: 짧은 이름(`티켓번호-짧은주제` 또는 `Hub-*`/`Forge-*`/`PlayHub-*` 규칙)을 쓰고 `codex/`, `backup/` 등 불필요한 프리픽스를 붙이지 않는다.
- **머지 커밋**: 사용자가 해당 머지를 명시적으로 요청하고 커밋 생성 전에 승인한 경우에만 만든다. 상위 저장소와 서브모듈에 동일하게 적용한다.
- **대규모 작업**: 대형 저장소 전체 체크아웃, 다수 파일 교체, 서브모듈·LFS 자산의 대량 전개, 워크트리 삭제는 실행 전 대상·범위·영향을 보고하고 승인을 받는다.
- **동시 작업**: 다른 에이전트 세션이 같은 워크트리에서 작업 중이면(미커밋 변경·실행 중 세션) 해당 파일을 수정·커밋하지 않고 현황을 먼저 보고한다.
- **커밋 전 리더 보고**: 가능한 경우 체크포인트와 결과 단계에서 커밋 전에 증거(스크린샷 또는 실측 로그)와 함께 아젠다별 간략 리포트를 먼저 보고한다.

### 2.1 워크트리 수명주기

이력은 워크트리 폴더가 아니라 Git 브랜치·커밋에 남는다. 쉬는 워크트리는 브랜치를 보존한 채 정리하고, 후속 작업 시 다시 만든다.

| 단계 | 규칙 |
|---|---|
| 생성 | 최신 트렁크에서 시작한다: `git worktree add -b <브랜치> ../<브랜치> PlayHub-Platform` → `owners.json` 등록 |
| 작업 중 | 장시간 작업·다중 에이전트 협업 시 워크트리 루트에 `.worktree-lock.json`(세션·담당·시작 시각)을 둔다(커밋 금지) |
| 점검 | `npm run worktrees:status` (미리보기: `PRUNABLE` / `PUSH-FIRST` / `KEEP`) |
| 정리 | 사용자 승인 후 `node tools/worktree-ownership/prune-worktrees.mjs --apply --only <브랜치,...>` — `archive/<브랜치>/<날짜>` 태그 생성·푸시 후 워크트리만 제거, 브랜치 유지 |
| 재생성 | 머지된 브랜치의 후속 작업: 최신 트렁크 기준으로 다시 만든다(`git branch -f <브랜치> PlayHub-Platform` 후 `git worktree add`, 또는 새 브랜치명). 미머지 브랜치: `git worktree add ../<브랜치> <브랜치>` |

- 정리 전 Git 무시 파일(로컬 DB, `Saved/`, 모델 등) 중 보존이 필요한 데이터는 별도 경로에 백업한다. 미커밋 변경이 있거나 origin에 푸시되지 않은 브랜치는 정리하지 않는다.
- 재생성 후 `npm ci --prefix hub`, `npm ci --prefix forge` 등 의존성을 다시 설치한다.

---

## 3. 자동화 테스트·QA 게이트

- 컴퓨터 제어 기반 반복 클릭보다 기존 테스트 프레임워크·CLI·API·엔진 테스트 훅을 활용한 재현 가능한 자동 검증과 로그 분석을 우선한다.
- 버그는 가능한 한 실패하는 테스트로 재현한 뒤 수정하고 회귀 테스트를 남긴다.
- 실제 실행한 검증과 미검증 항목을 명확히 구분해 보고한다. 로그는 지정 테스트 결과 폴더에 두고 민감 정보는 출력·커밋하지 않는다.

| 계층 | 명령 | 범위 | 실행 시점 |
|---|---|---|---|
| Tier 1 Fast | `npm run gate` / `npm run test:fast` | 소유권·스킬 동기화·`tools/qa/test-catalog.json`의 `tier: "fast"` 순수 Node 테스트 (무브라우저·무Godot·무Windows 전용) | 모든 커밋/PR, 트렁크 머지 전 (CI `pr-fast-gate.yml`) |
| 선택 스위트 / 변경분 | `npm run qa:changed`, `npm run qa:<스위트\|환경>`, `node tools/qa/run-suite.mjs --suite <...> --env <...>` | `smoke`·`component`·`regression`·`hub`·`forge`·`system`·`multiplatform`·`user`·`game` 등 12개 스위트 × `local`/`dev`/`live` 환경 필터 (한글 별칭 지원) | 작업 중 빠른 피드백·특정 영역/환경 검증 시 |
| Tier 2 Integration | `node tools/qa/run-suite.mjs --tier integration` (또는 `--suite browser`/`godot`/`portable`) | Chrome CDP/Playwright 브라우저, Godot 4.7.2 헤드리스, Windows Portable, 개별 게임 시뮬레이션·템플릿 런타임 | 해당 영역 변경 시·릴리스 전 |
| Tier 3 Nightly | `node tools/qa/run-suite.mjs --tier nightly`, `npm --prefix tools/Gamer/GamerQA run qa` | GamerQA AI 플레이·데일리 프로파일러·라이브 서버·아카이브 버전 검증 | 스케줄·라이브 승격 전 |

- **신규 TC 네이밍 및 등록 의무**: 저장소 내 모든 `*.test.{mjs,cjs,js}`는 `tools/qa/test-catalog.json`에 100% 등록해야 하며(`tools/qa/contract.gate-hygiene.test.mjs`가 사각지대·유령 항목·Fast 게이트 내 브라우저 직접 기동·7일 초과 quarantine을 차단), 파일명은 역할 접두/접미 규약(`smoke.*.test.*`, `contract.*.test.*`, `regression.*.test.*`, `*.browser.test.*`, `*.godot.test.*`, `*.portable.test.*`)을 따른다. 상세 분류표·CLI 사용법은 [docs/qa/TC_TAXONOMY_AND_NAMING.md](docs/qa/TC_TAXONOMY_AND_NAMING.md)를 참조한다.
- 화면 배치·렌더링 등 자동화 증거만으로 판단하기 어려운 항목에 한해 화면 제어를 보완적으로 사용한다.

---

## 4. 토큰 비용 및 서브 에이전트 운용

- 독립 가능한 조사, 제한된 파일 수정, 테스트 작성, 로그 분석은 서브 에이전트에 위임하고, 메인 에이전트는 의사결정·통합·최종 검증을 담당한다.
- 위임 시 목적, 관련 파일, 수정 허용 범위(가능하면 `owners.json` 소유 경로), 완료 조건, 결과 형식을 짧게 지정한다. 같은 작업을 여러 에이전트에 중복 배정하지 않는다.
- 단순 반복 작업은 경량 모델, 복잡한 설계·원인 불명 결함·보안/데이터 손실 위험이 큰 변경은 상위 모델을 사용한다. 사용자 요청 없이 전역 기본 모델 설정을 바꾸지 않는다.
- `references/`, `artifacts/`, `tools/Gamer/.venv*`, `tools/Gamer/models`, `forge/Saved`, `hub/dist`는 대용량·생성물이므로 전체 검색·읽기 대상에서 제외한다.
- 결과 보고는 변경 파일·핵심 근거·테스트 결과·남은 문제 위주로 간결하게 정리한다.

---

## 5. 웹 개발 작업 규칙

- 웹 UI·서버·웹 에디터 구현 및 검증 후(트렁크 병합 포함)에는 **로컬 접속 링크**(http://127.0.0.1:18130/ 등)와 함께 `cloudflared`(`artifacts/local-runtime/cloudflared/cloudflared.exe`) 외부 터널로 모바일(LTE/5G)에서 접속 가능한 HTTPS 링크를 제공한다.
  - 접속 주소는 백틱으로 감싸지 않고 클릭 가능한 링크로 제공한다.
  - 관리자 UI/API 등 loopback 전용 서비스는 외부 터널로 노출하지 않고 그 제약을 명시한다.
- 기존 테스트·로컬 서버 프로세스가 포트를 점유하면 해당 프로세스만 종료하고 다시 띄운다(무관한 사용자 프로세스는 종료하지 않는다).
- 정적 파일만 바뀌어 새로고침으로 반영되면 서버를 재실행하지 않고 기존 URL과 새로고침 안내만 제공한다.

---

## 6. 게임 콘텐츠 및 레퍼런스 규칙

- `games/` 하위 작업은 [games/AGENTS.md](games/AGENTS.md)(kebab-case ID, `catalog.json`·`manifest.json` 동기화, 버전 갱신)를 따른다.
- 조사·분석한 게임 레퍼런스는 `references/<게임명>/` 아래 `.md`로 저장하고, 확인된 사실·직접 관찰·해석/추정·자체 기획을 구분한다.

---

## 7. 프로젝트 스킬 (정본: `.agents/skills/`)

| 스킬 | 경로 | 용도 |
|---|---|---|
| `write-commit` | [.agents/skills/write-commit/SKILL.md](.agents/skills/write-commit/SKILL.md) | 영역 태그 기반 커밋 메시지 작성·커밋 |
| `write-ticket-commit` | [.agents/skills/write-ticket-commit/SKILL.md](.agents/skills/write-ticket-commit/SKILL.md) | 전역 티켓 번호 기반 커밋 메시지 규칙 |
| `git-update-branch` | [.agents/skills/git-update-branch/SKILL.md](.agents/skills/git-update-branch/SKILL.md) | 작업 브랜치·서브모듈 최신화(rebase) 및 충돌 해결 |
| `game-designer` | [.agents/skills/game-designer/SKILL.md](.agents/skills/game-designer/SKILL.md) | 게임 메카닉·밸런스·저사양 PC 설계 및 검증 핸드오프 |

- 스킬은 `.agents/skills/`에서만 수정하고 `npm run sync:skills`로 `.claude/skills/`에 복사한다. `npm run check:skills`(Fast 게이트 포함)가 두 위치의 불일치를 차단한다.
