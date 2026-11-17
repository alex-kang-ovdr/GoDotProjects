# Roblox Creator Workflow benchmark

조사·갱신일: 2026-11-17. 기준 자료는 Roblox Creator Hub 공식 문서이며, Studio의 현재 동작 설명을 제품에 그대로 보장하는 자료는 아니다. 문서의 사실과 PlayForge 적용 제안은 아래에서 분리한다.

## 공식 문서에서 확인한 사실

- Roblox 템플릿은 시작 place의 DataModel에 기본 객체를 제공하는 복사 가능한(uncopylocked) 게임이다. Baseplate는 SpawnLocation과 바닥판만 제공하고, Flat Terrain은 평탄한 잔디 지형의 빈 모델을 제공한다. 플랫폼 게임/레이싱/도시 등은 목적별 객체와 예제 로직을 포함한다. [Templates](https://create.roblox.com/docs/resources/templates)
- Roblox Studio의 Team Create는 같은 게임을 각자 다른 시간에 편집하거나 동시에 편집하는 협업 기능이다. 참가자는 Owner/Edit/Play/No Access 권한을 갖고, 실시간 collaborator 상태·색상 선택 표시·객체 코멘트를 제공한다. [Collaboration](https://create.roblox.com/docs/projects/collaboration)
- 기본 Live Scripting에서는 스크립트를 실시간 편집하며 저장/자동 저장 버전이 Script History에 기록된다. Drafts mode는 다른 사람에게 영향을 주지 않는 독립 편집 후 공유 저장소에 commit하는 선택 흐름이다. 저장된 place는 협업 세션에서 약 4분마다 클라우드 자동 저장된다. 협업 중 되돌리기는 다른 편집자의 자동 저장에 덮일 수 있어, Roblox는 복원 전 Team Create를 종료하라고 안내한다. [Collaboration](https://create.roblox.com/docs/projects/collaboration)
- Studio의 Test/Test Here는 클라이언트와 서버 simulation을 분리하며, Server & Clients는 최대 8개의 client simulation을 실행한다. Team Test는 협업자들이 함께 참여하는 한 번에 하나의 테스트 세션이며 참여자 client Output을 공유한다. [Studio testing modes](https://create.roblox.com/docs/studio/testing-modes)
- Version History는 저장·게시 버전, 버전 노트, 저장 유형/작성자 등의 조회·필터·비교·복원을 제공한다. 복원은 새 place 버전을 만들며 자동 게시하지 않는다. 공개 경험에 복원본을 적용하려면 다시 publish하고 서버를 재시작해야 한다. [Version History](https://create.roblox.com/docs/projects/version-history)
- 파일 기반 workflow 비교 문서는 Studio 중심, 코드 일부를 Git으로 관리, 전체 게임을 Git에서 관리하는 선택지를 구분한다. Team Create는 모두에서 실시간 편집에 쓰이며, 복잡한 fully-managed workflow는 대부분 팀에 필요하지 않을 수 있다고 안내한다. [Compare file-based workflows](https://create.roblox.com/docs/projects/file-based-workflows)

## 관찰과 해석

**직접 관찰:** Creator Hub가 소개하는 시작 경로는 빈 시작점(Baseplate/Flat Terrain) 또는 목적에 맞는 템플릿을 열어 편집하는 방식이다. 공동 편집, 플레이 테스트, 버전 기록/복원, 게시가 같은 Studio 작업 공간에 이어진다.

**해석:** 이 구성은 첫 작업을 쉽게 시작하게 하면서, 팀 편집의 즉시성과 Drafts의 격리된 코드 검토를 선택적으로 지원한다. 자동 저장은 편의 기능이고, 버전 복원은 게시와 분리된 운영 단계다. Roblox의 cloud collaboration을 PlayForge의 온프레미스/로컬 동기화 기능과 동등하다고 간주하지 않는다.

## PlayForge 적용 제안

1. **빈 지도 → 템플릿:** 새 프로젝트에 Empty/Default Map을 우선 제공하고, 같은 생성 화면에서 검증된 예제 템플릿을 선택할 수 있게 한다. 템플릿은 출처·라이선스·필수 플러그인·엔진 버전을 manifest에 기록하고, 원본 파일의 권리를 승계한다고 가정하지 않는다.
2. **초대와 공동 편집:** 명시적인 공유 설정과 역할 권한을 둔다. 실시간 동시 편집은 명령 단위 source authority와 revision 기반 충돌 처리를 거쳐야 한다. 현재 두 자체 Web UI는 같은 Yjs live document를 쓰지만, 공식 Godot Web Editor는 ZIP import 및 제한된 source API PoC만 보유한다. Scene/Node/property 전체 동시 편집은 구현·검증되지 않았다.
3. **테스트:** 편집 중인 revision/hash를 고정해 로컬 테스트를 시작하고 결과를 같은 revision에 연결한다. 여러 사용자의 실제 협동 테스트와 서버/클라이언트 simulation은 분리된 기능으로 제공한다. 현재 PlayForge UI PIE는 네이티브 Godot 실행의 mirror이며, Godot WASM Tappy smoke 및 공식 Editor import smoke의 범위를 넘는 테스트를 뜻하지 않는다.
4. **버전:** 저장 checkpoint와 게시 revision을 별도 표기하고, 각 변경에 작성자·시간·source hash·엔진/템플릿 lock·설명을 남긴다. 복구는 이전 source를 새 revision으로 복원한 뒤 별도 빌드/게시 승인을 거치도록 한다.
5. **배포:** 테스트 성공 산출물만 명시적 확인 후 배포 후보로 만들고, 상태·대상·revision·artifact digest를 보여준다. 현재 서비스는 build queue/status PoC일 뿐 실제 외부 플랫폼 게시, 사용자 인증, 상용 운영 배포를 제공하지 않는다.

## 평가 항목과 제한

후속 비교에서는 첫 지도 생성까지의 단계/시간, 템플릿에서 첫 수정까지의 단계, 공동 편집 반영/충돌 경험, 같은 revision에서 테스트되는지, 실패 빌드가 배포를 차단하는지, 버전 복원 후 배포가 명확히 분리되는지를 측정한다. 이 문서는 Roblox 제품을 직접 플레이해 얻은 usability 수치나 PlayForge acceptance 결과를 주장하지 않는다.

자료는 분석·설계 참고로만 사용했다. Roblox 문서의 텍스트/이미지/템플릿 자산은 복사·재배포하지 않았으며, 각 자산을 직접 사용할 경우 해당 자산의 별도 권리와 Roblox 약관을 확인해야 한다. 공식 문서 링크는 기능 근거이며 라이선스 허가가 아니다.
