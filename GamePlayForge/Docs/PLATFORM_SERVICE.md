# Platform service and creator workflow

갱신일: 2026-11-17. 이 문서는 공식 Godot Web Editor와 PlayForge의 서비스 경계를 정리하고, Roblox Creator Hub의 workflow를 참고한 제품 제안을 구분한다. 제안은 구현 완료나 cloud deployment 승인으로 취급하지 않는다.

## 현재 구현

공식 Godot 기반 PlayForge Creator가 주력 경로다. Classic/Godot Layout 비교 경로는 보존한다. upstream 4.7.2 엔진 바이너리를 고정하고 자체 웹 부트스트랩과 서비스 EditorPlugin을 분리했다. 별도 엔진 소스 분기 `playforge-web`는 [엔진 포크 기록](../GodotFork/README.md)에 준비했다. 엔진 C++ 코어 패치 및 별도 포크 바이너리 빌드는 아직 없으며, 웹 코드 수정은 `OfficialGodot/editor.html`과 `editor-bridge.js`로 관리한다.

- `/OfficialGodot/`: 프로젝트 라이브러리와 같은 화면의 Godot iframe. 첫 방문은 빈 3D 프로젝트를 생성한다. 예제는 회전 큐브가 있는 3D Playground다.
- 시작 선택: 완성된 예제 열기 또는 제작 과정 보기. 가이드는 준비된 스크립트와 설정을 한 번에 적용하고, 씬을 단계별로 구성하며 커서 이동·선택을 시각화한다. 0.5/1/2/4배속, 일시정지·재개·중지를 제공한다. 이는 스크립트로 재생하는 제작 시연이며 실제 AI 모델이나 MCP 서버가 판단하는 과정은 아니다.
- 협업: 프로젝트별 SSE 참여자·활동과 1.5초 주기 플러그인 파일 동기화. 저장된 파일의 서로 다른 변경을 병합하고 같은 파일 충돌은 보존·표시한다. 씬 속성 단위 CRDT나 동시에 같은 코드 위치를 편집하는 모델은 아니다. 커서와 타이핑 활동은 사람과 제작 가이드가 같은 API/렌더러를 사용하며 버전 기록을 생성하지 않는다.
- 버전: 파일 스냅샷, 리비전 기록, 복원 시 새 리비전 생성. 배포는 성공한 동일 프로젝트·동일 리비전의 Web 빌드만 허용한다. 배포 스냅샷은 불변이며 활성 배포를 복원할 수 있다.
- 테스트·배포: 실제 Godot Web export, 리비전별 테스트 링크, 서버 재시작 후 결과 조회. `/play/:projectId`는 활성 배포의 게임을 연다. 같은 서버에서 제공하는 배포이며 외부 클라우드 호스팅 프로비저닝은 수행하지 않았다. BrawlLabs는 아래의 별도 3대3 멀티플레이 로비를 사용하며, 다른 템플릿의 테스트 링크 공유 자체는 멀티플레이 구현이 아니다.
- 저장 위치: `Saved/Platform` 프로젝트, `Saved/Builds` 빌드. 신뢰된 팀용 PoC로 인증·역할·다중 tenant·공개 UGC 격리는 미구현이다. 텍스트 파일 중심이며 PNG/오디오 등 binary asset 동기화는 후속이다.

## 재현과 증거

`npm test`: 기존 회귀와 플랫폼 API 검증. `npm run test:platform`: 충돌·프로젝트 격리·버전/배포·presence/activity, 실제 Godot 빌드와 에디터 진입, 가이드 조작 검증. 결과는 `Saved/Tests/platform/`에 남긴다. Godot Web의 TCP listener 제한 및 upstream 경고는 별도 기록하며 무경고 성공으로 표현하지 않는다.

## 제안하는 창작 흐름

| 단계 | 제안 UX | 완료 기준 / 경계 |
|---|---|---|
| 빈 지도 | 새 프로젝트에서 Empty/Default Map을 열거나 최근 프로젝트를 재개 | 새 프로젝트 설정, 초기 scene, target profile이 명시됨 |
| 템플릿 | 검토된 starter template를 선택해 복제 | engine/plugin/template 버전과 자산 출처·라이선스를 기록 |
| 공동 편집 | 초대된 구성원이 역할에 맞춰 scene/code를 동시 수정 | identity와 ACL, 명령 검증·충돌 정책, 저장 상태가 먼저 구현되어야 함. 현행 shared Yjs는 기존 두 웹 UI에 한정 |
| 테스트 | 변경 revision을 고정해 로컬/Web 또는 협동 테스트 실행 | 결과에 source revision/hash, engine lock, target, 로그를 결합. 미지원 테스트를 성공으로 표시하지 않음 |
| 버전 | 이름/설명이 있는 checkpoint 저장, 차이 보기, 복원 | 복원은 새 source revision으로 생성하고 기존 기록은 보존 |
| 배포 | 검증된 artifact를 검토 후 사용자가 명시적으로 게시 | 게시가 실제 연결된 target에만 노출. artifact digest와 source revision 저장, 권한 확인, 실패 시 이전 release로 되돌리는 절차 제공 |

이 단계 모델은 Roblox의 empty/template 시작, Team Create, Studio test, Version History 및 별도 publish 경로를 참고한 **PlayForge 설계 제안**이다. Roblox 문서는 해당 제품 기능의 사실 근거일 뿐 PlayForge가 동등 기능을 갖췄다는 근거가 아니다. 상세 비교와 측정할 사용성 항목은 [Roblox Creator Workflow benchmark](../References/Roblox/CREATOR_WORKFLOW.md)에 기록한다.

## 구현 순서와 운영 경계

1. 먼저 local project/revision data model을 명확히 하고 생성·템플릿 import에 provenance와 engine/plugin lock을 기록한다.
2. service API에 사용자 identity, role ACL, 프로젝트별 저장 권한을 붙이고 base revision을 기준으로 source 변경을 검증한다. 현재 임의 client ID는 사용자 인증이 아니다.
3. Official Editor plugin 왕복을 검증한 뒤, text/source 변경과 scene 구조 변경의 동기화 범위를 별개로 명시한다. 전체 scene 동시 편집은 command schema, stable ID, revision/conflict 처리 및 data-loss 검증이 갖춰지기 전 지원한다고 표시하지 않는다.
4. revision에 고정된 테스트 job과 build artifact 기록을 연결한다. 현재 build queue/status PoC의 실제 오류 처리·artifact 보존·clean/incremental 동등성은 출시 기준에 맞춰 추가 검증해야 한다.
5. 백업/restore와 artifact rollback을 검증한 후에만 외부 게시 adapter를 연결한다. 외부 배포가 없는 구성에서는 “Deploy”를 제공하지 않고 로컬 export/build로 표시한다.

현재 Node 서비스와 `Saved/GodotWorkspace`는 단일 서버/단일 공유 프로젝트 구조다. TLS reverse proxy는 예시 설정일 뿐 실제 운영 배포가 검증된 상태가 아니다. 임의 GDScript를 격리 실행하는 보안 경계가 없으므로 공개 UGC/cloud runtime으로 노출하면 안 된다. 운영 전에는 인증·권한, tenant isolation, 백업 보존, 비밀정보 관리, 자원 한도, 감사 로그, 업데이트 및 복구 절차를 구현하고 검증해야 한다.

## 근거 자료

- [Roblox Templates](https://create.roblox.com/docs/resources/templates)
- [Roblox Collaboration / Team Create](https://create.roblox.com/docs/projects/collaboration)
- [Roblox Studio testing modes](https://create.roblox.com/docs/studio/testing-modes)
- [Roblox Version History](https://create.roblox.com/docs/projects/version-history)
- [Roblox file-based workflow comparison](https://create.roblox.com/docs/projects/file-based-workflows)
- [Godot official Web Editor](https://docs.godotengine.org/en/stable/tutorials/editor/using_the_web_editor.html)

조사 자료는 workflow 참고에만 사용했다. Roblox/Godot 이름과 공식 문서 링크는 출처 식별용이다. 외부 이미지, 템플릿, 기타 에셋을 이 문서에 복제하지 않았다. 제품에 에셋을 가져올 때는 원 출처와 사용·수정·재배포 조건을 별도 확인하고 기록해야 한다.

## 이번 검증 결과 (2026-11-17)

- 기본 `npm test`: 37 checks 통과. 원본이 없는 과거 게임 두 suite는 건너뜀으로 별도 기록.
- `Tests/platform-service.test.cjs`: 빈 맵·예제의 실제 Web 빌드, 다른 프로젝트 빌드 배포 거절, 서버 재시작 후 배포/빌드 링크 유지, 실제 iframe Godot pluginready 및 화면 크기 검증 통과.
- `Tests/guided.test.cjs`: 기본 모드(에디터만 stub)와 `PLAYFORGE_REAL_EDITOR=1` 실제 Godot 모드 모두 통과. 완성본/시연 선택, 커서·타이핑, 4배속, 일시정지 중 리비전 유지, 재개, 최종 scene/script 일치를 확인. Godot 설정 파일은 마지막 줄바꿈 한 개만 차이를 허용하며 그 외 설정은 일치 검사. 실제 완료 후 리비전 10이 5초 이상 유지되어 반복 자동 저장이 없음을 확인.
- 실제 Godot 화면과 시연: `Saved/Tests/platform/officialgodot-platform.png`, `guided-real-typing.png`, `guided-real-completed.png` (실제 에디터), `guided-stub-*` (에디터 대체 화면). Web TCP listener `ERR_CANT_CREATE`, occlusion-culling 빌드 경고와 SwiftShader/Emscripten 경고는 남아 있으나 pluginready와 파일 동기화·시연 완료를 막지 않음.
- 엔진 소스 분기는 준비했지만 C++ 수정/자체 엔진 빌드 또는 외부 클라우드 배포 완료로 해석하지 않음.

## 게임 템플릿과 내 커서 표시 (2026-11-17)

- Tappy Chicken: 기존 프로젝트의 GDScript 규칙과 SVG 3개를 포함하는 독립 Godot 2D 템플릿.
- Iron Wood: References/Besiege의 독립 IRONWOOD 웹 제작물을 참고한 Godot 시작 템플릿. 조립·주행·조준·발사·표적 제거·재설계 핵심 흐름이며 선박/비행/피스톤/전체 캠페인 동등 구현은 범위 밖이다. 자체 재질·메시를 포함한다. 원본 웹 자료는 보존한다.
- 완성본과 제작 시연 모두 같은 에셋을 포함한다. 시연 프로젝트는 최초 생성 시 에셋과 빈 2D/3D 씬이 이미 있으며, 에디터가 뜬 뒤 에셋을 다운로드하거나 타이핑해서 만드는 단계는 없다. 스크립트는 한 번에 적용하고 씬 조립만 단계별로 재생한다. 템플릿 목록은 Templates/*/metadata.json과 프로젝트 파일에서 구성한다.
- 본인의 clientId로 돌아온 활동은 오버레이에서 제외한다. 활동 전송은 유지하여 상대방에게는 보이며, 제작 가이드의 별도 clientId와 타인의 커서·클릭·타이핑도 표시한다.
- 검증: 기본 회귀 39 checks 통과(과거 누락 게임 2 suite는 skip), 두 페이지 자기 커서/상대 커서 검증, 기존 가이드 회귀, 에셋 사전 포함 검증. `npm run test:game-templates`는 두 게임의 실제 Godot Web 빌드·Chrome 실행과 오류 로그를 검사한다. 결과는 Saved/Tests/game-templates에 보관한다.


## 마우스 중심 제작 시연 (2026-11-17 갱신)

- 스크립트 전체와 프로젝트 설정을 한 번의 저장으로 적용한다. 코드 작성 애니메이션, 코드 미리보기, 커서 아래 소스 코드 표시는 제거했다. OS 클립보드를 읽거나 덮어쓰지 않고 기존 프로젝트 파일 API와 플러그인 동기화를 사용한다.
- 씬 항목을 단계별로 추가한 뒤, 실제 Godot 에디터가 해당 리비전을 동기화한 것을 확인하고 항목을 선택한다. 2D/3D 화면과 인스펙터에 선택 결과를 보여준다. 에디터 선택 결과 응답 없이 다음 단계로 진행하지 않는다. 마우스 경로는 시연용이며 선택 자체는 플러그인의 에디터 명령으로 수행한다.
- 쉬운 자연어 작업 설명은 진행 패널에 표시한다. 커서 아래 입력 텍스트는 이름·속성 등 한 줄 텍스트 상자 입력에만 표시하며, 일반 이동·클릭·스크립트 편집에는 표시하지 않는다. 실제 Godot 입력은 비밀번호가 아닌 LineEdit에만 제한하고 CodeEdit/TextEdit 및 조합 단축키는 제외한다.
- 기존 속도 조절·일시정지·재개·중지와 자신의 협업 커서 숨김은 유지한다. 중지하면 이미 저장한 구성은 남는다.


## iframe 게임 임베딩 PoC (2026-11-17)

`/OfficialGodot/embedding-poc.html`에서 2D / 3D / 스크립트 / 게임 버튼을 비교한다. 기존 Creator 상단에도 진입 링크가 있다. `npm run poc:embedding`은 기본 127.0.0.1:4174에서 별도 체험 저장소(Saved/EmbeddingPoC)를 사용하므로 기존 Creator 프로젝트를 변경하지 않는다.

- 2D/3D/스크립트 버튼은 같은 Godot Web 에디터 iframe을 유지하고, 검증된 부모 메시지와 플러그인의 EditorInterface 호출로 실제 주 화면을 바꾼다. 스크립트는 프로젝트의 첫 GDScript를 연다.
- 게임 버튼은 현재 서버에 저장된 리비전으로 Godot Web export를 요청하고 결과를 별도 iframe에 표시한다. 편집기로 되돌아가도 편집기를 재시작하지 않는다. 같은 리비전 게임은 재사용하고, 다시 실행 및 게임 닫기를 제공한다.
- 나란히 보기는 편집기와 게임 iframe을 동시에 표시한다. 게임 영역을 클릭하면 게임에 입력 포커스가 간다. 편집 변경은 저장·동기화된 뒤 다음 게임 실행에 반영되며, 네이티브 Game Bar의 실시간 Remote 노드 편집이나 디버거 연결을 제공하는 것은 아니다.
- 이 PoC는 브라우저의 표준 iframe과 기존 서버 Web export를 이용한다. 별도 네이티브 창의 임베딩이나 브라우저 보안 정책 우회를 구현하지 않는다.

근거: [Godot Game embedding](https://docs.godotengine.org/en/latest/tutorials/editor/game_embedding.html), [Godot Web editor](https://docs.godotengine.org/en/stable/tutorials/editor/using_the_web_editor.html). 2026-11-17 확인: latest 문서는 개발 버전이며 Web editor 문서에는 4.7 갱신 전 안내가 있다. 지원 범위의 최종 판단은 현재 프로젝트의 실제 실행 검증으로 구분한다.


## Iron Wood 충돌·조작 수정 (2026-11-17)

- W/S 전후진과 A/D 조향의 입력 축 순서를 수정했다. 바퀴의 회전축과 시각적 위치를 정렬하고 실린더 충돌 모양을 추가했다. 바퀴가 바닥을 파고들어 보이는 현상을 수정했으며, 독립 서스펜션/휠 조인트 구현은 아니다.
- 실제 키 이벤트를 이용한 물리 회귀에서 바닥 정착 높이 0.200, W 전진 속도 5.034, A 조향 변화 0.700 rad, 제동 속도 2.770 → 0.000을 확인했다. 바퀴 회전 후 축 방향 유지도 검사한다. `npm run test:ironwood-physics`, 결과 `Saved/Tests/ironwood-physics/last-run.log`.
- 저장된 Iron Wood 예제는 기존 스크립트가 원본과 같음을 먼저 확인한 뒤 파일 API로 수정 스크립트만 적용했다. 다른 파일과 사용자가 변경한 씬은 유지했고 새 리비전에 기록했다. 로컬 백업과 적용 증거는 `Saved/Tests/ironwood-physics/project-before-fix.json`, `project-update.json`이다.


## BrawlLabs 템플릿 및 최종 검증 (2026-11-17)

- `Templates/brawllabs`는 `References/Brawl Stars`의 Brawl Lab을 참고한 독립 Godot 2D 템플릿이다. 원본은 변경하지 않았다. 3v3 로컬 봇 전투, 마우스 조준·투사체, 탄약, 보석 수집·확보 승리, 사망/부활, 일시정지/재시작을 포함한다. 원본 7개 경쟁 모드 전체 포팅은 아니며 한 가지 보석 모드의 시작 템플릿이다.
- 자체 제작 SVG 4개를 처음부터 포함한다. 에디터에서 볼 수 있는 Preview 씬 노드가 있어 스크립트를 한 번에 적용한 다음 마우스 중심 씬 구성 시연을 진행한다.
- 기본 회귀 42 checks 통과. 과거 원본 누락 게임 2 suite는 별도 skip 기록을 유지한다. 추가로 실제 Godot Web 에디터에서 Playground/Tappy Chicken/Iron Wood/BrawlLabs 제작 시연, 세 게임 Web export 및 Chrome 실행, iframe PoC의 네 화면 전환·동시 표시·재사용·닫기를 확인했다.
- BrawlLabs native 회귀는 입력에 의한 이동/투사체 피해, 보석 획득, 일시정지/재개를 확인한다. 부활/승리/재시작은 상태 초기 조건을 고정한 생명주기 검사다. 이동/전투는 physics tick에서 갱신한다. headless 창 좌표와 뷰포트 좌표 변환을 반영해 실제 입력 경로로 테스트한다.
- 증거: `Saved/Tests/latest/summary.json`, `Saved/Tests/platform/guided-real*.json`, `Saved/Tests/game-templates/`, `Saved/Tests/embedding-poc/`, `Saved/Tests/brawllabs/smoke.log`.


## 엔진 내부 게임 영역과 BrawlLabs 멀티플레이 (2026-11-17)

Godot 자체의 게임 버튼(Ctrl+F4)을 누르면 중앙 Game 작업 영역을 게임 iframe이 채운다. `EditorInterface.get_editor_main_screen()`의 실제 위치/크기를 전달하므로 씬 트리·인스펙터·상단 버튼은 가리지 않는다. 리사이즈도 반영한다. 2D/3D/스크립트로 전환하면 iframe을 숨기고 같은 편집기와 게임 인스턴스를 유지한다. 일반 템플릿은 저장된 리비전의 Web export, BrawlLabs는 멀티플레이 로비를 연다.

BrawlLabs의 웹 서비스 실행은 서버 권한형 3대3이다. 두 사람 이상 Ready이며 미준비 참가자가 없을 때 5초 후 시작하고 빈 팀 슬롯은 봇으로 채운다. 팀당 최대 3명, 20초 초과 미준비자는 관전자, 중간 이탈자는 동일한 상태를 유지하는 봇으로 교체한다. 관전자·경기 중 입장자는 입력 권한을 갖지 않는다. 준비 취소로 조건이 깨지면 카운트다운을 취소한다. 게임 파일 준비를 마친 뒤 로비에 입장하여 로딩 시간이 미준비 제한을 소모하지 않게 했다.

`/brawllabs` WebSocket은 기존 편집 협업 소켓과 분리된다. 서버가 위치·충돌·사격·HP·봇·보석·승패를 계산하고 입력만 수신한다. 기존 신뢰된 팀용 PoC 운영 경계는 동일하며 외부 클라우드에 새로 배포한 것은 아니다. 방은 실행 중 서버 메모리에 유지된다. 정상 이탈은 즉시 처리하고 비정상 연결 손실은 heartbeat로 감지한다.

검증: `Tests/brawllabs-multiplayer.test.cjs`의 시간 경계/팀 정원/취소/봇 대체/입력/6명 정원/방 격리, `Tests/brawllabs-browser.test.cjs`의 실제 Godot 두 클라이언트 + 봇 4명 및 이탈 후 봇 5명, `Tests/editor-game-embedding.test.cjs`의 실제 엔진 Game 작업 영역 채움과 2D 복귀. 실행 증거는 `Saved/Tests/brawllabs-multiplayer/` 및 `Saved/Tests/editor-game-embedding/`에 저장한다. 동일 프로젝트·리비전·소스의 Web 빌드는 로비 참가자 사이에 재사용한다.


최종 회귀: 기본 49 checks 통과(기존 원본 누락 2 suite는 skip 유지). 실제 두 브라우저의 2인+4봇 경기와 중도 이탈 5봇 전환 통과. 실제 Godot Game 작업 영역은 일반 3D export와 BrawlLabs 로비 두 분기 모두 테스트했으며, 중앙 영역 채움 및 2D 복귀/iframe 유지가 통과했다.
